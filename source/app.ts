import express from 'express';
import cookieParser from "cookie-parser";
import categoryRoutes from './products/category.route';
import productRoutes from './products/product.route';
import branchRoutes from './branches/branch.route';
import addressRoutes from './delivery/address.route';
import authRouter from './authentication/authenticationRouter'

const app = express();

app.use(express.json()); 
app.use(express.urlencoded({extended:true}));
app.use(cookieParser());


app.use("/api/v2/categories", categoryRoutes);
app.use("/api/v2/products", productRoutes);
app.use("/api/v2/branches", branchRoutes);
app.use("/api/v2/addresses",addressRoutes);
app.use("/api/v2/auth",  authRouter);

app.use("/", (req, res) => {
    res.send("Welcome to Pizzaland API , Made with ❤️ by Yousra");
});

export default app;