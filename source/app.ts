import express from 'express';
import cookieParser from "cookie-parser";
import productRoutes from './products/productRouter.js';
import branchRoutes from './branches/branchRouter.js';
import deliveryRoutes from './delivery/deliveryRouter.js';
import authRouter from './authentication/authenticationRouter.js'
import crmRoutes from './crm/crmRouter.js';
import orderRoutes from './orders/ordersRouter.js';
import errorMiddleware from './middlewares/error.middleware.js';

const app = express();

app.use(express.json()); 
app.use(express.urlencoded({extended:true}));
app.use(cookieParser());


//app.use("/api/v2/categories", categoryRoutes);
app.use("/api/v2/products", productRoutes);
app.use("/api/v2/branches", branchRoutes);
app.use("/api/v2/deliveries", deliveryRoutes);
app.use("/api/v2/auth",  authRouter);
app.use("/api/v2/crm", crmRoutes);
app.use("/api/v2/orders", orderRoutes);

app.use("/", (req, res) => {
    res.send("Welcome to Pizzaland API , Made with ❤️ by Yousra");
});

// Must stay last: turns multer / JSON / unexpected errors into JSON responses
app.use(errorMiddleware);

export default app;