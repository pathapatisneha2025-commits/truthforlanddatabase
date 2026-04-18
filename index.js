const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

const resourcesRouter = require("./routes/resources");
const blogRouter = require("./routes/blogs");

app.use("/resources", resourcesRouter);
app.use("/blogs",blogRouter);


app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
