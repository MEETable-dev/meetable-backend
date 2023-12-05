const express = require('express');
const router = express.Router();
const db = require('../db');
const authMember = require('../middlewares/authmember');

// 
function generateRandomString(length) {
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

// 새 약속잡기(로그인 한 경우 유저 이름 제공)
router.get('/username', authMember, async(req, res) => {
    if (req.isMember === true) {
        const [member] = await db.promise().query(`
            SELECT member_name
            FROM member
            WHERE member_id = ${req.memberId};
        `)
        res.status(200).send({
            name: member[0].member_name,
            message: "user name provided"
        })
    } else {
        res.status(401).send({
            statusCode: 1000,
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
        await db.promise().query(`
            INSERT INTO memberjoin(member_id, promise_id, member_promise_name, canconfirm)
            VALUES ('${req.memberId}', '${promiseId}', '${req.body.promise_name}', 'T')
        `)
        const [resultFolder] = await db.promise().query(`
            SELECT folder_id FROM folder
            WHERE folder_name = 'meetable' AND member_id = ${req.memberId}
        `)
        await db.promise().query(`
            INSERT INTO FOLDER_PROMISE(folder_id, promise_id)
            VALUES (${resultFolder[0].folder_id}, ${promiseId})
        `)
        res.status(201).send({ 
            promiseCode: promiseId + "_" + randomString,
            message: "new promise generated"
        });
    } else { //비회원인 경우
        res.status(201).send({ 
            promiseCode: promiseId + "_" + randomString,
            message: "new promise generated"
        });
    }
});


module.exports = router;