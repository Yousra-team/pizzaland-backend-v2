import express from 'express';
import customerRoutes from './routes/customer.route';
import categoryRoutes from './routes/category.route';
import productRoutes from './routes/product.route';

const app = express();

app.use(express.json()); 
app.use(express.urlencoded({extended:true}));

app.use("/api/v2/customers", customerRoutes);
app.use("/api/v2/categories", categoryRoutes);
app.use("/api/v2/products", productRoutes);

app.use("/", (req, res) => {
    res.send("Welcome to Pizzaland API , Made with ❤️ by Yousra");
});

export default app;