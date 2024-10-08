const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('../utils/jwt-util');
const redisClient = require('../utils/redis');
const refresh = require('./refresh');
const cache = require('memory-cache');
const nodemailer = require('nodemailer');
const ejs = require('ejs');
const path = require('path');
const authJWT = require('../middlewares/authJWT');
const authMember = require('../middlewares/authmember');
var appDir = path.dirname(require.main.filename);

// 회원가입
router.post('/signup', async(req, res) => {
    //redis 연결 for refresh token 저장
    //signToken 해체
    try {
        const signInfoVerified = jwt.signVerify(req.body.signToken);
        if (signInfoVerified === false) {
            return res.status(400).json({
                statusCode: 1020, 
                message: "invalid sign token" 
            })
        }
        // 이메일 토큰이 만료된 경우
        const emailVerified = jwt.emailVerify(signInfoVerified.email);
        console.log(emailVerified)
        if (emailVerified === false) {
            return res.status(400).json({
                statusCode: 1120,
                message: "invalid email token, email token expired" 
            })
        }
        const salt = await bcrypt.genSalt(saltRounds);
        const encrypted = await bcrypt.hash(signInfoVerified.pwd, salt);

        const insertMemberResult =  await db.promise().query(`
            INSERT INTO member(member_name, member_email, member_pwd, is_accept_marketing)
            VALUES('${signInfoVerified.name}','${emailVerified.email}', '${encrypted}','${req.body.marketingPolicy}')
        `)
        const memberId = insertMemberResult[0].insertId;
        await db.promise().query(`
            INSERT INTO folder(folder_name, member_id)
            VALUES 
            ('meetable', ${memberId}),
            ('trash', ${memberId})
        `)
        // const [member] = await db.promise().query(`
        //     SELECT * FROM member WHERE member_email = '${emailVerified.email}'
        // `)
        // const accessToken = jwt.access(member[0]);
        // const refreshToken = jwt.refresh();
        // redisClient.set(signInfoVerified.email, refreshToken);
        res.status(201).send({ 
            message: "signup succeed"
        });
    } catch (err) {
        if(err.errno===1062){
            res.status(400).send({ 
                statusCode: 1062,
                message: "email already exists" 
            });
        }
        console.log(err);
    }
});

//로그인 회원 존재 시 JWT발급 존재 안하면 404에러 발생
router.post('/login', async(req, res) => {
    const [member] = await db.promise().query(`
        SELECT * FROM member WHERE member_email = '${req.body.email}'
    `)
    if (member.length == 0) {
        return res.status(404).json({
            statusCode: 404,
            message: "member not found" 
        })
    }
    bcrypt.compare(req.body.pwd, member[0].member_pwd, (err, same) => {
        if (same) {
            const accessToken = jwt.access(member[0]);
            const refreshToken = jwt.refresh();
            redisClient.set(req.body.email, refreshToken);

            res.status(200).send({
                accessToken: accessToken,
                refreshToken: refreshToken,
                message: "login succeed"
            });
        } else {
            res.status(401).send({
                statusCode: 1001,
                message: "invalid password"
            });
        }
    })
});

// signtoken 발행
// Todo: socialType 받아서 socialType 별 signToken 발행 구현  
router.post('/signToken', async(req, res) => {
    const signToken = jwt.sign(req.body.name, req.body.emailToken, req.body.pwd);
    if (req.body.pwd.length < 8) {
        return res.status(400).json({
            statusCode: 1003,
            message: "password should be at least 8 characters",
        });
    }
    return res.status(200).send({
        signToken: signToken,
        message: "sign token provided",
    });
});

// access token 재발급
router.post('/token', refresh);

// header에 따라 검증하기 위한 test api -> 회원/비회원 구분할 때 이용 예정, 발전시켜야함
router.get('/test', (req, res) => {
    if (req.headers===undefined) {
        res.status(200).send({message: "no header"});
    } else {
        if (req.headers.authorization === undefined) {
            res.status(200).send({message: "hello anyone"});
        } else {
            if (req.headers.authorization.includes('@')) {
                const temp = req.headers.authorization;
                res.status(401).send({statusCode:1090, message: `include @@: ${temp}`});
            } else {
                const accessToken = (req.headers.authorization).split('Bearer ')[1];
                res.status(200).send({message: `hello ${accessToken}`})
            }
        }
       
    }
});

// 이메일 인증번호 발송
router.post("/sendVerifyCode", async (req, res) => {
    let randomNumber = Math.floor(Math.random() * 1000000);
    let verifyCode = ("000000" + randomNumber).slice(-6);
    let emailTemplete;
    ejs.renderFile(
        appDir + "/template/authMail.ejs",
        { authCode: verifyCode },
        function (err, data) {
            if (err) {
                console.log(err);
            }
            emailTemplete = data;
        }
    );
    const transporter = nodemailer.createTransport({
        service: "gmail",
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        auth: {
            user: process.env.NODEMAILER_USER,
            pass: process.env.NODEMAILER_PASS,
        },
    });
    const mailOptions = {
        from: `MEETable`,
        to: req.body.email,
        subject: "[MEETable] 회원가입을 위한 인증번호 안내",
        html: emailTemplete,
    };
    // const [member] = await db.promise().query(`
    //     SELECT member_id FROM member WHERE member_email = '${req.body.email}'
    // `)
    // if (member.length != 0 && req.body.findPwdOrSignup == "S") { // 이미 가입된 이메일이고 회원가입 화면인 경우
    //     return res.status(400).json({
    //         statusCode: 2400,
    //         message: "want to singup with this email but email already exists"
    //     });
    // } else if (member.length == 0 && req.body.findPwdOrSignup == "P") {
    //     return res.status(404).json({
    //         statusCode: 2404,
    //         message: "want to find pwd of this email but no member found"
    //     })
    // }
    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            return res.status(500).json({
                statusCode: 500,
                message: `Failed to send authentication email to ${req.body.email}`,
            });
        }
        cache.put(req.body.email, verifyCode, 180000);
        res.status(200).send({
            message: `Successfully send authentication email to ${req.body.email}`,
        });
        transporter.close();
    });
});

// 인증번호 검증
router.post("/confirmVerifyCode", async (req, res) => {
    const code = cache.get(req.body.email);
    const [member] = await db.promise().query(`
        SELECT member_id FROM member WHERE member_email = '${req.body.email}'
    `);
    const isMember = member.length != 0 ? true : false;
    if (!code) {
        res.status(404).send({
            statusCode: 1100,
            message: "verify code doesn't exist. expired or not created",
        });
    } else if (code != req.body.verifyCode) {
        res.status(401).send({
            statusCode: 1110,
            message: "wrong verify code",
        });
    } else {
        cache.del(req.body.email);
        const emailToken = jwt.email(req.body.email);
        return res.status(201).send({
            emailToken: emailToken,
            isMember: isMember,
            message: "email token provided",
        });
    }
});

//로그아웃
router.post('/logout', authJWT, async (req, res, next) => {
    const delRefresh = await jwt.logout(req.email);
    if (delRefresh === false) {
        res.status(404).send({
            statusCode: 1130,
            message: "refresh token not found"
        })
    } else {
        res.status(200).send({
            isLogout: true,
            message: "logout succeed"
        })
    }
});

// 이메일 찾기
router.get('/findEmail', async(req, res) => {
    const [member] = await db.promise().query(`
        SELECT member_id FROM member WHERE member_name = '${req.query.name}' AND member_email = '${req.query.email}'
    `)
    if (member.length == 0) {
        res.status(404).send({
            statusCode: 404, 
            message: "member not found" 
        })
    } else {
        res.status(200).send({
            isMember: true,
            message: "member found"
        })
    }
});

// 비밀번호 재설정 존재하는 이메일일 때만 실행가능
// 회원일 경우 기존 pwd, 새 pwd 두 개 받아야함
router.patch('/resetpwd', authMember, async(req, res)=> {
    if (req.isMember === true) {
        const [member] = await db.promise().query(`
            SELECT member_pwd FROM member WHERE member_id = ${req.memberId}
        `)
        // 기존 비밀번호 맞는지 검증
        const same = await bcrypt.compare(req.body.originalPwd, member[0].member_pwd);
        if (same) {
            // 새 비밀번호가 기존 비밀번호와 같은지 검증
            const sameOriginNew = await bcrypt.compare(req.body.newPwd, member[0].member_pwd);
            if (sameOriginNew) {
                res.status(400).send({
                    statusCode: 1002,
                    message: "new password should be different from the original password"
                });
            } else {
                const salt = await bcrypt.genSalt(saltRounds);
                const encrypted = await bcrypt.hash(req.body.newPwd, salt);
                await db.promise().query(`
                    UPDATE member SET member_pwd = '${encrypted}' WHERE member_id = ${req.memberId}
                `).then(() => {
                    res.status(200).send({
                        updatePWD: true,
                        message: "successfully update pwd"
                    })
                })
            }
        } else {
            res.status(401).send({
                statusCode: 1001,
                message: "invalid original password"
            });
        } 
    } else {
        const emailVerified = jwt.emailVerify(req.body.emailToken); 
        if (emailVerified === false) {
            return res.status(401).json({
                statusCode: 1120,
                message: "invalid email token, email token expired" 
            })
        } else {
            const [member] = await db.promise().query(`
                SELECT member_pwd FROM member WHERE member_email = '${emailVerified.email}'
            `)
            if (member.length == 0) {
                res.status(404).send({
                    statusCode: 404, 
                    message: "member not found" 
                })
            } else {
                const sameOriginNew = await bcrypt.compare(req.body.newPwd, member[0].member_pwd);
                if (sameOriginNew) {
                    res.status(400).send({
                        statusCode: 1002,
                        message: "new password should be different from the original password"
                    });
                } else {
                    const salt = await bcrypt.genSalt(saltRounds);
                    const encrypted = await bcrypt.hash(req.body.newPwd, salt);
                    try {
                        await db.promise().query(`
                        UPDATE member SET member_pwd = '${encrypted}' WHERE member_email = '${emailVerified.email}'
                    `).then(() => {
                        res.status(200).send({
                            updatePWD: true,
                            message: "successfully update pwd"
                        });
                    });
                    } catch (err) {
                        console.log(err)
                    }
                
                }
            }
            
            
        }
    }
});

// router.post('/verifypwd', authMember, async(req, res) => {
//     if (req.isMember === true) {
//         const [member] = await db.promise().query(`
//             SELECT member_pwd FROM member WHERE member_id = ${req.memberId}
//         `)
//         bcrypt.compare(req.body.pwd, member[0].member_pwd, (err, same) => {
//             if (same) {
//                 res.status(200).send({
//                     isValidPwd: true,
//                     message: "valid pwd"
//                 });
//             } else {
//                 res.status(401).send({
//                     statusCode: 1001,
//                     message: "invalid password"
//                 });
//             }
//         })
//     } else {
//         res.status(401).send({
//             statusCode: 1000,
//             message: "access denied."
//         });
//     }
// });
module.exports = router;