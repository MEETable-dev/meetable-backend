const express = require('express');
const router = express.Router();
const db = require('../db');
const authMember = require("../middlewares/authmember");

router.post("/add", authMember, async (req, res) => {});

router.delete("/delete", authMember, async (req, res) => {});

router.patch("/update", authMember, async (req, res) => {});

router.get("/monthinfo", authMember, async (req, res) => {});

router.get("/dayinfo", authMember, async (req, res) => {});




module.exports = router;