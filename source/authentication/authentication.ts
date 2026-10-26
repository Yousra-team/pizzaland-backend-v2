import {prisma} from "../lib/prisma.js";
import {Request, Response} from "express";
import { CustomerSchema , employeeLoginSchema , employeeSchema , customerLoginSchema  } from "./auth.schema.js";
import {createVerification, createVerificationCheck, sendMagicLinkToken, sendMagicLinkTokenFR} from "../notifications/index.js"
import {signAccessToken, signRefreshToken, verifyRefreshToken, verifyAccessToken} from "./jwt.util.js";
import {comparePassword, hashPassword} from "./bcrypt.util.js";
import { CreateIdentifier } from "../utilities/counter.js";
import * as z from "zod";
import crypto from "crypto";


export const registerCustomer = async (req: Request, res: Response): Promise<void> => {
    try {

        const result = CustomerSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: result.error});
            return;
        }
        const customer = result.data;

        const existingCustomer = await prisma.customers.findUnique({
            where: {phone: customer.phone},
        });

        if (existingCustomer) {
            res.status(400).json({ error: "Customer already exists" });
            return;
        }
        
        const id = await CreateIdentifier("CUST");

        if(!id) {
            res.status(500).json({message: "Server error in creating Id"})
            return;
        };

        const newCustomer = await prisma.customers.create({
            data: {
                customerId: id,
                ...customer
            },
        });
        
        await prisma.accounts.create({
            data: {
                customerId: newCustomer.customerId,
                balance: 20,
            },
        });
        
        res.status(201).json(newCustomer);

    } catch (error) {
        console.error("Error registering customer:", error);
        res.status(500).json({ error: "Failed to register customer" });
    }
};

// This endpoint here is to register an employee, only accessible by admin and or manager
export const registerEmployee = async (req: Request, res: Response): Promise<void> => {

    try {
        const result = employeeSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: result.error});
            return;
        }

        const employee = result.data;

        const existingEmployee = await prisma.employees.findUnique({
            where: {
                email: employee.email,
            },
        }); 

        if (existingEmployee) {
            res.status(400).json({ error: "Employee with this email already exists" });
            return;
        }

        const hashedPassword =  await hashPassword(employee.password)

        employee.password = hashedPassword

        const newEmployee = await prisma.employees.create({
            data: {
               ...employee
            },
        });
        res.status(201).json({message:`Account created with email: ${employee.email}`, newEmployee});

    } catch (error) {
        console.log("Error registering employee:", error);
        res.status(500).json({ error: "Failed to register employee" });
    }
};

// This endpoint will register the admin role
export const registerAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = employeeSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: result.error});
            return;
        }

        const admin = result.data

        if (admin.role !== "ADMIN") {
            res.status(400).json({ error: "Only ADMIN role can be registered through this endpoint" });
            console.log("Your role is not admin")
            return;
        }

        if (!admin.email.endsWith("@yousracompany.com")) {
            res.status(403).json({message: "Haha That was smart but you dont work here!"});
            console.log("Better luck next time!")
            return;
        };

        const existingAdmin = await prisma.employees.findUnique({
            where: {
                email:admin.email
            },
        });

        if (existingAdmin) {
            res.status(400).json({ error: "Admin with this email already exists" });
            console.log("Admin Already Exists!")
            return;
        };

        const hashedPassword = await hashPassword(admin.password)
        admin.password = hashedPassword

        const newAdmin = await prisma.employees.create({
            data: {
                ...admin
            },
        });
        res.status(201).json({message:`Admin account created with email: ${admin.email}`});

    } catch (error) {
        console.error("Error registering admin:", error);
        res.status(500).json({ error: "Failed to register admin" });
    }
};


export const loginCustomer = async (req: Request, res: Response): Promise<void> => {
    try{
        const result = customerLoginSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: result.error});
            return;
        }
        const phone = result.data.phone;
        const channel = result.data.channel;

        const existingCustomer = await prisma.customers.findUnique({
            where: {
                phone,
            },
        })

        if (!existingCustomer) {
            res.status(400).json({ error: "Customer with this phone number does not exist" });
            console.log("Shall You register first?!")
            return;
        }
        
        if(channel == "sms")  {     
            const verify = await createVerification(existingCustomer.phone , "sms")
            res.status(200).json({message:" You just received an OTP sms code"})
            console.log("Verify", verify)
            return;
        };
             
       if (channel == "whatsapp") {
            const verify = await createVerification(existingCustomer.phone , "whatsapp")
            res.status(200).json({message:" You just received an OTP whatsapp code"})
            console.log("Verify", verify)
            return;      
        };

      res.status(200).json({message:"verification code sent" })

    }catch (error) {
        console.error("Error logging in customer:", error);
        res.status(500).json({ error: "Failed to login customer" });
    }
};

export const verifyCustomer = async (req: Request , res: Response): Promise<void> => {
    try {
        const phone = req.body.phone
        const code = req.body.code
         
        if(!phone || !code) {
            res.status(400).json({message:"We need your four digit OTP code"})
            console.log("No OTP or No Valid Phone number")
            return
        };
          
        const verify = await createVerificationCheck(phone , code);
        
        if (verify.status !== "approved") {
            res.status(403).json({message: "Wrong OTP or could not verify"});
            console.log(verify)
            return
        }

        const customer = await prisma.customers.findUnique({
            where: {
                phone : phone
            }
        });

        if(!customer) {
            res.status(400).json({message: "No account tied to this phone number"})
            return
        }
              
    const authToken = await signAccessToken({Id: customer.customerId , role:"CUSTOMER"})
    const refreshToken = await signRefreshToken({Id: customer.customerId, role:"CUSTOMER"})

    await prisma.token.create({
            data:{
               token: refreshToken,
               customerId: customer.customerId,
               type: "refreshToken",
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            },
        }); 

           // Refresh token goes in an httpOnly cookie — JS on the client can't read it
        res.cookie("refreshToken", refreshToken, {
                httpOnly: true,
                secure: true,       // HTTPS only
                sameSite: "strict",
                maxAge: 7 * 24 * 60 * 60 * 1000,
         });

        res.status(200).json({message: "Customer verified" , authToken});
        console.log("Verification Was Successful")
        return

    } catch (error) {
       console.error(error)
       res.status(500).json({message:"Internal error occurred while verifying"})
    }
};

// For employees to log in
export const loginEmployee = async (req: Request, res: Response): Promise<void> => {
    try{
        const result = employeeLoginSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: result.error});
            return;
        }
        const {email , password} = result.data;

        const existingEmployee = await prisma.employees.findUnique({
            where: {
                email: email,
            },
        })

        if (!existingEmployee || !(await comparePassword(password, existingEmployee.password))) {
            res.status(400).json({ error: "Invalid email or password" });
            return;
        }

       const authToken = await signAccessToken({Id: email , role: existingEmployee.role})
       const refreshToken = await signRefreshToken({Id: email , role: existingEmployee.role})

        await prisma.token.create({
                data:{
                    token: refreshToken,
                    employeeEmail: email,
                    employeeRole: existingEmployee.role,
                    type: "refreshToken",
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

           // Refresh token goes in an httpOnly cookie — JS on the client can't read it
             res.cookie("refreshToken", refreshToken, {
                  httpOnly: true,
                  secure: true,       // HTTPS only
                  sameSite: "strict",
                 maxAge: 7 * 24 * 60 * 60 * 1000,
              });

        res.status(200).json({message:`Log in successful` , authToken})
    }catch (error) {
        console.error("Error logging in employee:", error);
        res.status(500).json({ error: "Failed to login employee" });
    }
};

// For the admin to Log in
export const loginAdmin = async (req : Request , res: Response): Promise<void> => {
    try{
        const result = employeeLoginSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: result.error});
            return;
        }
        const {email , password} = result.data;

        const existingAdmin = await prisma.employees.findUnique({
            where: {
                email: email,
            },
        })

        if (!existingAdmin || !(await comparePassword(password, existingAdmin.password))) {
            res.status(400).json({ error: "Invalid email or password" });
            return;
        }

        if (existingAdmin.role !== "ADMIN") {
            res.status(403).json({ error: "Access denied. Only admins can log in through this endpoint." });
            return;
        }
      // When Send Grid Will be SetUp 
        /*const token = crypto.randomBytes(32).toString("hex");
        const sendToken =  await prisma.token.create({
            data:{
                token,
                employeeEmail: existingAdmin.email,
                employeeRole: existingAdmin.role,
                type: "verificationToken",
                expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
            },
        });
        /*
        This section is commented untill Twilio SendGrid is Setup to verify admin Emails
        // Get Admin language preference before sending the magic link token
        const preference = await prisma.userPreferences.findFirst({
            where: {
                employeeEmail: existingAdmin.email,
                name: "preferredLanguage",
            },
        });

        const preferredLanguage = preference?.value ?? "fr"

        if (preferredLanguage == "en") {
            await sendMagicLinkToken({to: existingAdmin.email, token: token, expiresIn: 5})// Use Twilio Send Grid not Whatsapp
            res.status(200).json({message: "Verification code sent"})
        } else {
            await sendMagicLinkTokenFR({to: existingAdmin.email, token: token, expiresIn: 5})
            res.status(200).json({message : "Code de vérification envoyé"})
        }
      */
        const authToken = await signAccessToken({Id: email , role: existingAdmin.role})
       const refreshToken = await signRefreshToken({Id: email , role: existingAdmin.role})

        await prisma.token.create({
                data:{
                    token: refreshToken,
                    employeeEmail: email,
                    employeeRole: existingAdmin.role,
                    type: "refreshToken",
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

           // Refresh token goes in an httpOnly cookie — JS on the client can't read it
             res.cookie("refreshToken", refreshToken, {
                  httpOnly: true,
                  secure: true,       // HTTPS only
                  sameSite: "strict",
                 maxAge: 7 * 24 * 60 * 60 * 1000,
              });

        res.status(200).json({message:`Log in successful` , authToken})
    }catch (error) {
        console.error("Error logging in admin:", error);
        res.status(500).json({ error: "Failed to login admin" });
    }
};


export const refreshAccessToken = async (req: Request, res: Response): Promise<void> => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (!refreshToken) {
            res.status(401).json({ error: "No refresh token provided" });
            return;
        }

        let payload;
        try {
            payload = verifyRefreshToken(refreshToken);
        } catch {
            res.status(401).json({ error: "Invalid or expired refresh token" });
            return;
        }

        const storedToken = await prisma.token.findUnique({
            where: { token: refreshToken },
        });

        if (!storedToken || storedToken.revoked || storedToken.expiresAt < new Date()) {
            res.status(401).json({ error: "Refresh token revoked or expired" });
            return;
        }

        const newAccessToken = signAccessToken({ Id: payload.Id, role: payload.role });

        res.status(200).json({ authToken: newAccessToken });

    } catch (error) {
        console.error("Error refreshing access token:", error);
        res.status(500).json({ error: "Failed to refresh access token" });
    }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
    try {
        const refreshToken = req.cookies.refreshToken;

        if (refreshToken) {
            await prisma.token.updateMany({
                where: { token: refreshToken },
                data: { revoked: true },
            });
        }

        res.clearCookie("refreshToken");
        res.status(200).json({ message: "Logged out" });

    } catch (error) {
        console.error("Error logging out:", error);
        res.status(500).json({ error: "Failed to logout" });
    }
};


