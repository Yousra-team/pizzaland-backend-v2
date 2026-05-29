import express from 'express';
import customerRoutes from './routes/customer.route';

const app = express();

app.use(express.json());

app.use("/api/v2/customers", customerRoutes);

app.use("/", (req, res) => {
    res.send("Welcome to Pizzaland API , Made with ❤️ by Yousra");
});

export default app;