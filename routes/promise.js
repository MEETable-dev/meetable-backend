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

// todo: 약속 세부 정보 저장하기/불러오기/수정하기(삭제)
// 약속 세부 정보 저장하기
// 회원, 비회원 나누고 요일 기준 날짜기준 시간 유무로 나눠서 처리
// 요일 기준
router.post('/time', authMember, async(req, res) => {
    const isMember = req.isMember;
    const promiseId = req.body.promiseId;
    const memberId = req.isMember ? req.memberId : req.nonmemberId;
    const tableName = req.isMember ? 'membertime' : 'nonmembertime';
    let status;
    try {
        // promise 테이블에서 weekvsdate, ampmvstime 값 가져오기
        const [promiseSettings] = await db.promise().query(`
            SELECT weekvsdate, ampmvstime, start_time, end_time 
            FROM promise WHERE promise_id = ${promiseId};
        `);
        const { weekvsdate, ampmvstime } = promiseSettings[0];
        if (weekvsdate === 'W' && ampmvstime === 'F') {
            // 1. 가능한 요일만 저장
            status = await saveWeekAvailable(req.body.weekAvailable, memberId, promiseId, tableName, isMember);
        } else if (weekvsdate === 'D' && ampmvstime === 'F') {
            // 2. 가능한 날짜만 저장
            status = await saveDateAvailable(req.body.dateAvailable, memberId, promiseId, tableName, isMember);
        } else if (weekvsdate === 'W' && ampmvstime === 'T') {
            // 3. 가능한 요일과 시간 저장
            status = await saveWeekTimeAvailable(req.body.weektimeAvailable, memberId, promiseId, tableName, promiseSettings[0], isMember);
        } else if (weekvsdate === 'D' && ampmvstime === 'T') {
            // 4. 가능한 날짜와 시간 저장
            status = await saveDateTimeAvailable(req.body.datetimeAvailable, memberId, promiseId, tableName, promiseSettings[0], isMember);
        }
        if (status == 200) {
            res.status(200).send({
                message: "time saved successfully"
            });
        } else if (status == 1750) {
            res.status(400).send({
                statusCode: 1750,
                message: "wrong weekday string"
            })
        } else if (status == 1751) {
            res.status(400).send({
                statusCode: 1751,
                message: "date out of range of promise"
            })
        } else if (status == 1752) {
            return res.status(400).json({
                statusCode: 1752,
                message: "wrong time id"
            })
        } else if (status == 1753) {
            return res.status(400).json({
                statusCode: 1753,
                message: "wrong time range"
            })
        }
        
    } catch (error) {
        console.log(error);
        res.status(500).send({
            message: `Error saving time: ${error.message}`
        });
    }
});

async function saveWeekAvailable(weekAvailable, memberId, promiseId, tableName, isMember) {
    // 가능한 요일 데이터 저장
    let statusCode = 200
    const correctString = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    for (let weekday of weekAvailable) {
        if (correctString.includes(weekday)) {
            if (isMember) {
                await db.promise().query(`
                    INSERT INTO ${tableName} (memberjoin_id, week_available)
                    VALUES(
                        (SELECT memberjoin_id FROM memberjoin WHERE member_id = ${memberId} AND promise_id = ${promiseId}),
                        '${weekday}'
                    )
                `); 
            } else if (isMember === false) {
                await db.promise().query(`
                    INSERT INTO ${tableName} (nonmember_id, week_available)
                    VALUES(${memberId},'${weekday}')
                `); 
            }
        } else {
            statusCode = 1750;
        }
    }
    return statusCode;
}

async function saveDateAvailable(dateAvailable, memberId, promiseId, tableName, isMember) {
    // 해당 promise_id에 해당하는 datetomeet 값 가져오기
    const [validDates] = await db.promise().query(`
        SELECT datetomeet FROM promisedate WHERE promise_id = ${promiseId}
    `);
    const validDatesArray = validDates.map(item => {
        const date = new Date(item.datetomeet);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // getMonth()는 0부터 시작하므로 1을 더함
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
    let statusCode = 200;
    for (let date of dateAvailable) {
        // 주어진 날짜가 유효한 날짜 배열에 있는지 확인
        if (validDatesArray.includes(date)) {
            if (isMember) {
                await db.promise().query(`
                    INSERT INTO ${tableName} (memberjoin_id, date_available)
                    VALUES (
                        (SELECT memberjoin_id FROM memberjoin WHERE member_id = ${memberId} AND promise_id = ${promiseId}),
                        '${date}'
                    )
                `);
            } else if (isMember === false) {
                await db.promise().query(`
                    INSERT INTO ${tableName} (nonmember_id, date_available)
                    VALUES (${memberId}, '${date}')
                `);
            }
        } else {
            statusCode = 1751;
        }
    }
    return statusCode;
}

async function saveWeekTimeAvailable(weektimeAvailable, memberId, promiseId, tableName, promiseSettings, isMember) {
    const { start_time, end_time } = promiseSettings;
    const correctString = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    let statusCode = 200;
    for (let weekdaytime of weektimeAvailable) {
        // 요일, 시작 시간, 종료 시간 파싱
        const [weekday, startTime, endTime] = weekdaytime.split(' ');
        if (correctString.includes(weekday)) { 
            // 시간이 유효한 범위 내에 있는지 확인
            if (startTime >= start_time && endTime <= end_time) {
                // timeslot 테이블에서 해당 시간에 대한 time_id 찾기
                const [timeSlot] = await db.promise().query(`
                    SELECT id FROM timeslot 
                    WHERE start_time = '${startTime}' AND end_time = '${endTime}'
                `);

                const timeId = timeSlot[0]?.id;

                if (timeId) {
                    if (isMember) {
                        await db.promise().query(`
                            INSERT INTO ${tableName} (memberjoin_id, week_available, time_id)
                            VALUES(
                                (SELECT memberjoin_id FROM memberjoin WHERE member_id = ${memberId} AND promise_id = ${promiseId}),
                                '${weekday}', 
                                ${timeId}
                            )
                        `);
                    } else if (isMember === false) {
                        await db.promise().query(`
                            INSERT INTO ${tableName} (nonmember_id, week_available, time_id)
                            VALUES(${memberId},'${weekday}', ${timeId})
                        `); 
                    }
                } else {
                    statusCode = 1752;
                }
            } else {
                statusCode = 1753;
            }
        
        } else {
            statusCode = 1750;
        }
    }
    return statusCode;
}

async function saveDateTimeAvailable(datetimeAvailable, memberId, promiseId, tableName, promiseSettings, isMember) {
    const { start_time, end_time } = promiseSettings;

    const [validDates] = await db.promise().query(`
        SELECT datetomeet FROM promisedate WHERE promise_id = ${promiseId}
    `);
    const validDatesArray = validDates.map(item => {
        const date = new Date(item.datetomeet);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0'); // getMonth()는 0부터 시작하므로 1을 더함
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    });
    let statusCode = 200;

    for (let datetime of datetimeAvailable) {
        const [date, startTime, endTime] = datetime.split(' ');
        if (validDatesArray.includes(date)) {
            // 시간이 유효한 범위 내에 있는지 확인
            if (startTime >= start_time && endTime <= end_time) {
                // timeslot 테이블에서 해당 시간에 대한 time_id 찾기
                const [timeSlot] = await db.promise().query(`
                    SELECT id FROM timeslot 
                    WHERE start_time = '${startTime}' AND end_time = '${endTime}'
                `);

                const timeId = timeSlot[0]?.id;

                if (timeId) {
                    if (isMember) {
                        await db.promise().query(`
                            INSERT INTO ${tableName} (memberjoin_id, date_available, time_id)
                            VALUES(
                                (SELECT memberjoin_id FROM memberjoin WHERE member_id = ${memberId} AND promise_id = ${promiseId}),
                                '${date}', 
                                ${timeId}
                            )
                        `);
                    } else if (isMember === false) {
                        await db.promise().query(`
                            INSERT INTO ${tableName} (nonmember_id, date_available, time_id)
                            VALUES(${memberId},'${date}', ${timeId})
                        `); 
                    }
                } else {
                    statusCode = 1752;
                }
            } else {
                statusCode = 1753;
            }
        } else {
            statusCode = 1751;
        }
    }
    return statusCode;
}

module.exports = router;