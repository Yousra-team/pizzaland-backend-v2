import dotenv from "dotenv";

dotenv.config({
  path:['.env.dev','.env.test']
});


import app from "./app.js";


const startServer = async () => {
  try {


    const PORT = process.env.PORT || 3000;

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error(error);
    process.exit(1);
  }
};

startServer();