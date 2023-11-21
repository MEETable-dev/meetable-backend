const express = require('express');
const router = express.Router();
const db = require('../db');
const authMember = require('../middlewares/authmember');

// promise_sequence를 계산하는 함수
async function calculatePromiseSequence(memberId) {
    const result = await db.promise().query(`
        SELECT MAX(promise_sequence) AS max_sequence FROM memberjoin WHERE member_id = ${memberId}
    `);
    return (result[0].max_sequence || 0) + 1;
}

function generateRandomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}
router.get('/username', authMember, async(req, res) => {
    if (req.isMember === true) {
        res.status(200).send({
            data: {
                name: req.nickname
            },
            message: "user name"
        })
    } else {
        res.status(401).send({
            statusCode: 1000,
            data: {},
            message: "access denied."
        });
    }
});

// 새 약속 생성
router.post('/create', authMember, async(req, res) => {
    // 5자리 문자열 생성
    const randomString = generateRandomString(5);
    console.log(randomString);
    let result;
    let promiseId;
    if (req.body.ampmvstime == 'F') {
        result = await db.promise().query(`
            INSERT INTO promise(promise_code, promise_name, weekvsdate, ampmvstime, canallconfirm)
            VALUES('${randomString}', '${req.body.promise_name}', '${req.body.weekvsdate}', '${req.body.ampmvstime}', '${req.body.canallconfirm}')
        `)
        promiseId = result[0].insertId;
        if (req.body.weekvsdate == 'W') { // week로 받을 때 1차까지는 요일 추가 x
            console.log(promiseId);
        } else if (req.body.weekvsdate == 'D') {
            for (var date of req.body.date) {
                await db.promise().query(`
                    INSERT INTO promisedate(promise_id, datetomeet)
                    VALUES('${promiseId}', '${date}')
                `)
            }
        }
    } else if (req.body.ampmvstime == 'T') {
        result = await db.promise().query(`
            INSERT INTO promise(promise_code, promise_name, weekvsdate, ampmvstime, start_time, end_time, canallconfirm)
            VALUES('${randomString}', '${req.body.promise_name}', '${req.body.weekvsdate}', '${req.body.ampmvstime}', '${req.body.start_time}', '${req.body.end_time}', '${req.body.canallconfirm}')
        `)
        promiseId = result[0].insertId;
        if (req.body.weekvsdate == 'W') { // week로 받을 때 1차까지는 요일 추가 x
            console.log(promiseId)
        } else if (req.body.weekvsdate == 'D') {
            for (var date of req.body.date) {
                await db.promise().query(`
                    INSERT INTO promisedate(promise_id, datetomeet)
                    VALUES('${promiseId}', '${date}')
                `)
            }
        }
        
    }
    if (req.isMember === true) { //회원인 경우
        const promise_sequence = await calculatePromiseSequence(req.memberId);
        await db.promise().query(`
            INSERT INTO memberjoin(member_id, promise_id, member_promise_name, promise_sequence, canconfirm)
            VALUES ('${req.memberId}', '${promiseId}', '${req.body.promise_name}', '${promise_sequence}', 'T')
        `)
        res.status(201).send({ 
            data: {
                "promiseCode": promiseId + "_" + randomString,
            },
            message: "new promise generated"
        });
    } else { //비회원인 경우
        res.status(201).send({ 
            data: {
                "promiseCode": promiseId + "_" + randomString,
            },
            message: "new promise generated"
        });
    }
});





module.exports = router;