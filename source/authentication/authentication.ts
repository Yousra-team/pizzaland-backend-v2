import {prisma} from "../lib/prisma.js";
import {Request, Response} from "express";
import { CustomerSchema , employeeLoginSchema , employeeSchema , customerLoginSchema  } from "./auth.schema.js";
import {sendMagicLinkToken, sendMagicLinkTokenFR} from "../notifications/index.js"
import * as crypto from "node:crypto";
import {signAccessToken, signRefreshToken, verifyRefreshToken, verifyAccessToken} from "./jwt.util.js";
import {comparePassword, hashPassword} from "./bcrypt.util.js";


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
            res.status(400).json({ error: "Customer with this phone number already exists" });
            return;
        }
        const newCustomer = await prisma.customers.create({
            data: {
                ...customer
            },
        });

        res.status(201).json(newCustomer);

    } catch (error) {
        console.error("Error registering customer:", error);
        res.status(500).json({ error: "Failed to register customer" });
    }
}

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
        res.status(201).json({message:`Account created with email: ${employee.email}`});

    } catch (error) {
        console.log("Error registering employee:", error);
        res.status(500).json({ error: "Failed to register employee" });
    }
};

// This endpoint will register the admin role
export const registerEmployeeAsAdmin = async (req: Request, res: Response): Promise<void> => {
    try {
        const result = employeeSchema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: result.error});
            return;
        }

        const admin = result.data

        if (admin.role !== "ADMIN") {
            res.status(400).json({ error: "Only ADMIN role can be registered through this endpoint" });
            // We check if the role is not ADMIN, and if so, we return a 400 error with a message indicating that only ADMIN role can be registered through this endpoint.
            return;
        }

        const existingAdmin = await prisma.employees.findUnique({
            where: {
                email:admin.email
            },
        });

        if (existingAdmin) {
            res.status(400).json({ error: "Admin with this email already exists" });
            return;
        };

        const hashedPassword = await hashPassword(admin.password)
        admin.password = hashedPassword

        const newAdmin = await prisma.employees.create({
            data: {
                ...admin
            },
        });
        res.status(201).json({message:`Admin account created with email: ${admin.password}`});

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

        const existingCustomer = await prisma.customers.findUnique({
            where: {
                phone: phone,
            },
        })

        if (!existingCustomer) {
            res.status(400).json({ error: "Customer with this phone number does not exist" });
            return;
        }

        const token = crypto.randomBytes(32).toString("hex");
       const sendToken =  await prisma.token.create({
            data:{
                token,
                customerPhone: existingCustomer.phone,
                type: "verificationToken",
                expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
            },
        });
        
        
         // Get User language preference before sending the magic link token
         const preference = await prisma.userPreferences.findFirst({
             where: {
                 customerPhone: existingCustomer.phone,
                 name: "preferredLanguage",
             },
         });

         const preferredLanguage = preference?.value ?? "fr"

        if (preferredLanguage == "en") {
             await sendMagicLinkToken({to: existingCustomer.phone, token: token, expiresIn: 5})// change expiresIn from string to number
             res.status(200).json({message:"verification code sent"})
         } else {
             await sendMagicLinkTokenFR({to: existingCustomer.phone, token: token, expiresIn: 5})// change expiresIn from string to number
             res.status(200).json({message:"code de vérification envoyé"})
         }
        res.status(200).json({message:"verification code sent", sendToken})
    }catch (error) {
        console.error("Error logging in customer:", error);
        res.status(500).json({ error: "Failed to login customer" });
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

       const authToken = await signAccessToken({userId: email , role: existingEmployee.role})
       const refreshToken = await signRefreshToken({userId: email , role: existingEmployee.role})

        await prisma.token.create({
                data:{
                    token: refreshToken,
                    employeeEmail: email,
                    employeeRole: existingEmployee.role,
                    type: "refreshToken",
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

        res.status(200).json({message:`Log in successful` , authToken , refreshToken})
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
        const authToken = await signAccessToken({userId: email , role: existingAdmin.role})
       const refreshToken = await signRefreshToken({userId: email , role: existingAdmin.role})

        await prisma.token.create({
                data:{
                    token: refreshToken,
                    employeeEmail: email,
                    employeeRole: existingAdmin.role,
                    type: "refreshToken",
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

        res.status(200).json({message:`Log in successful` , authToken , refreshToken})
    }catch (error) {
        console.error("Error logging in admin:", error);
        res.status(500).json({ error: "Failed to login admin" });
    }
};

export const verifyToken = async (req: Request, res: Response): Promise<void> => {
    try{
        const token = req.body.token
        let authToken: string , refreshToken: string

        if (!token) {
            res.status(400).json({ error: "Token is required" });
            return;
        }

        const existingToken = await prisma.token.findUnique({
            where: {
                token: token
            }
        });

        if (!existingToken) {
            res.status(400).json({ error: "Token has expired or is corrupted" });
            return;
        }
        if (existingToken.expiresAt < new Date()) {
            await prisma.token.delete({ where: { token: existingToken.token } });
            res.status(400).json({ error: "Token has expired" });
            return;
        }

        if (existingToken.customerPhone && existingToken.type == "verificationToken") {
            authToken = signAccessToken({ userId: existingToken.customerPhone, role: "CUSTOMER" });
            refreshToken = signRefreshToken({ userId: existingToken.customerPhone, role: "CUSTOMER" });
            // Persist refresh Tokens
            await prisma.token.create({
                data:{
                    token: refreshToken,
                    customerPhone: existingToken.customerPhone,
                    type: "refreshToken",
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });
            await prisma.customers.update({
                where:{
                    phone: existingToken.customerPhone
                },
                data:{
                    verified: true
                }
            });

        } else if (existingToken.employeeEmail && existingToken.type == "verificationToken") {
            authToken = signAccessToken({ userId: existingToken.employeeEmail, role: existingToken.employeeRole });
            refreshToken = signRefreshToken({ userId: existingToken.employeeEmail, role: existingToken.employeeRole });
            // Persist Refresh Token
            await prisma.token.create({
                data:{
                    token: refreshToken,
                    employeeEmail: existingToken.employeeEmail,
                    employeeRole: existingToken.employeeRole,
                    type: "refreshToken",
                    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
                },
            });

            await prisma.employees.update({
                where:{
                    email: existingToken.employeeEmail
                },
                data:{
                    verified: true
                }
            });

        } else {
            res.status(400).json({ error: "Invalid token" });
            return;
        }

        await prisma.token.delete({
            where: {
                token : existingToken.token
            }
        })
        // Refresh token goes in an httpOnly cookie — JS on the client can't read it
        res.cookie("refreshToken", refreshToken, {
            httpOnly: true,
            secure: true,       // HTTPS only
            sameSite: "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000,
        });

        res.status(200).json({ authToken });
        return;


    }catch (e) {
    res.status(500).json({ error: "Failed to verify token" })
    return;

    }
}
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

        const newAccessToken = signAccessToken({ userId: payload.userId, role: payload.role });

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