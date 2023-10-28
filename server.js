require("dotenv").config();
const express = require('express');
const app = express();
const morgan = require("morgan");
const bodyParser = require('body-parser');
const cors = require('cors');

const port = 3000;

app.use(morgan("dev"));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended : false}));
app.use(cors());

const { createServer } = require("http");
const httpServer = createServer(app);

httpServer.listen(port, () => {
    console.log("서버 시작");
})
