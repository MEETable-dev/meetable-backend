const express = require('express');
const router = express.Router();
const db = require('../db');
const authMember = require('../middlewares/authmember');

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

// 약속 참여
// 비회원인 경우 두 경우가 존재
// 1. 기존에 존재하는 이름, 비밀번호인 경우 로그인
// 2. 기존에 존재하지 않는 이름, 비밀번호인 경우 해당 약속에 비회원으로 새로 가입
// 회원인 경우 약속에 들어와 참여하기를 누르면 약속에 참여됨
router.post('/participate', authMember, async(req, res) => {
    const promiseId = req.body.promiseId; // _로 parsing된 값을 보내야함
    const nickname = req.body.nickname; // 별명 또는 비회원 이름
    const password = req.body.password; // 비회원 비밀번호 (회원일 경우 undefined, 비밀번호 없을 경우 null로 줘야함)

    if (!promiseId) {
        return res.status(400).send({
            statusCode: 1024,
            message: "required body missing: promiseId"
        });
    } else if (promiseId.includes('_')) {
        return res.status(400).send({
            statusCode: 1025,
            message: "promise id should be integer, not including '_'"
        });
    }
    try {
        if (req.isMember === true) {
            const [promiseResult] = await db.promise().query(`
                SELECT canallconfirm FROM promise WHERE promise_id = ${promiseId};
            `);
            const canConfirm = promiseResult[0].canallconfirm;
             // memberjoin 테이블에 참여 정보 추가
             await db.promise().query(`
                INSERT INTO memberjoin (member_id, promise_id, member_promise_name, canconfirm)
                VALUES (${req.memberId}, ${promiseId}, '${nickname}', '${canConfirm}');
            `);
            const [resultFolder] = await db.promise().query(`
                SELECT folder_id FROM folder
                WHERE folder_name = 'meetable' AND member_id = ${req.memberId}
            `)
            await db.promise().query(`
                INSERT INTO FOLDER_PROMISE(folder_id, promise_id)
                VALUES (${resultFolder[0].folder_id}, ${promiseId})
            `)
            res.status(200).send({
                message: "successfully participated as a member"
            });
        } else if (req.isMember === false) {
            // 비회원의 기존 여부 확인
            const [nonMemberExists] = await db.promise().query(`
                SELECT nonmember_id, nonmember_pwd FROM nonmember 
                WHERE nonmember_name = '${nickname}' AND promise_id = ${promiseId};
            `);
            if (nonMemberExists.length === 0) {
                result = await db.promise().query(`
                    INSERT INTO nonmember (promise_id, nonmember_name, nonmember_pwd)
                    VALUES (${promiseId}, '${nickname}', '${password}');
                `);
                nonmemberId = result[0].insertId;
                res.status(201).send({
                    nonmemberId: nonmemberId,
                    message: "successfully participated as a new non-member"
                });
            } else {
                if (nonMemberExists[0].nonmember_pwd == password) {
                    res.status(201).send({
                        nonmemberId: nonMemberExists[0].nonmember_id,
                        message: "successfully login as a non-member"
                    });
                } else {
                    // 비밀번호 틀린 경우 새로운 비밀번호로 같은 이름의 비회원 생성
                    result = await db.promise().query(`
                        INSERT INTO nonmember (promise_id, nonmember_name, nonmember_pwd)
                        VALUES (${promiseId}, '${nickname}', '${password}');
                    `);
                    nonmemberId = result[0].insertId;
                    res.status(201).send({
                        nonmemberId: nonmemberId,
                        message: "successfully participated as a new non-member"
                    });
                }
            }
        }
    } catch (err) {
        console.log(err);
        res.status(500).send({
            statusCode: 1234,
            message: `Error participating in promise: ${err.message}`
        });
    }
        
});



module.exports = router;