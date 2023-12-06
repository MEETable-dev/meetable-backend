const express = require('express');
const router = express.Router();
const db = require('../db');
const authMember = require('../middlewares/authmember');

router.get('/info', authMember, async(req, res) => {
    if (req.isMember === true) {
        const [member] = await db.promise().query(`
            SELECT member_name, member_email
            FROM member
            WHERE member_id = ${req.memberId};
        `)
        res.status(200).send({
            name: member[0].member_name,
            email: member[0].member_email,
            message: "member info"
        });
    } else {
        res.status(401).send({
            statusCode: 1000,
            message: "access denied."
        });
    }
});

router.patch('/resetname', authMember, async(req, res) => {
    if (req.isMember === true) {
        await db.promise().query(`
            UPDATE member 
            SET member_name = '${req.body.name}' 
            WHERE member_email = '${req.email}';
        `).then( () => {
            res.status(200).send({
                nameUpdated: true,
                message: "member name updated"
            });
        });
    } else {
        res.status(401).send({
            statusCode: 1000,
            message: "access denied."
        });
    }
});

router.delete('/quit', authMember, async(req, res) => {
    if (req.isMember === true) {
        try {
            // 회원 존재 여부 확인
            const [memberExists] = await db.promise().query(`
                SELECT member_id, member_name FROM member WHERE member_id = ${req.memberId};
            `);

            if (memberExists.length === 0) {
                // 회원이 존재하지 않는 경우
                return res.status(404).send({
                    statusCode: 404,
                    message: "member not found"
                });
            } 
            await db.promise().query(`
                DELETE FROM member WHERE member_id = ${req.memberId};
            `);
            res.status(200).send({
                name: memberExists[0].member_name,
                email: req.email,
                message: "member deleted"
            });
        } catch (err) {
            console.log(error);
            res.status(500).send({
                statusCode: 1234,
                message: `Error deleting member: ${error.message}`
            });
        }
    } else {
        res.status(401).send({
            statusCode: 1000,
            message: "access denied."
        });
    }
});

module.exports = router;