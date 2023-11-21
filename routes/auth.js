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
var appDir = path.dirname(require.main.filename);

// 회원가입
router.post('/signup', async(req, res) => {
    //redis 연결 for refresh token 저장
    //signToken 해체
    const signInfoVerified = jwt.signVerify(req.body.signToken);
    if (signInfoVerified === false) {
        return res.status(400).json({
            statusCode: 1020, 
            data: {},
            message: "invalid sign token" 
        })
    }
    // 이메일 토큰이 만료된 경우
    const emailVerified = jwt.emailVerify(signInfoVerified.email);
    console.log(emailVerified)
    if (emailVerified === false) {
        return res.status(400).json({
            statusCode: 1120,
            data: {},
            message: "invalid email token, email token expired" 
        })
    }
    // 비밀번호 저장 때문에 bcrypt 사용
    bcrypt.genSalt(saltRounds, (err, salt) => {
        bcrypt.hash(signInfoVerified.pwd, salt, (err, encrypted) => {
            db.promise().query(`
                INSERT INTO member(member_name, member_email, member_pwd, is_accept_marketing)
                VALUES('${signInfoVerified.name}','${emailVerified.email}', '${encrypted}','${req.body.marketingPolicy}')
            `).then( () => {
                const accessToken = jwt.access(signInfoVerified.email);
                const refreshToken = jwt.refresh();
                redisClient.set(signInfoVerified.email, refreshToken);
                res.status(201).send({ 
                    data: {
                        "accessToken": accessToken,
                        "refreshToken": refreshToken
                    },
                    message: "signup succeed"
                });
            })
            .catch(err => {
                if(err.errno===1062){
                    res.status(400).send({ 
                        statusCode: 1062, 
                        data: {},
                        message: "email already exists" 
                    });
                }
                console.log(err);
            })
        })
    })
});

//로그인 회원 존재 시 JWT발급 존재 안하면 404에러 발생
router.post('/login', async(req, res) => {
    const [member] = await db.promise().query(`
        SELECT * FROM member WHERE member_email = '${req.body.email}'
    `)
    if (member.length == 0) {
        return res.status(404).json({
            statusCode: 404, 
            data: {},
            message: "member not found" 
        })
    }
    bcrypt.compare(req.body.pwd, member[0].member_pwd, (err, same) => {
        if (same) {
            const accessToken = jwt.access(member[0]);
            const refreshToken = jwt.refresh();
            redisClient.set(req.body.email, refreshToken);

            res.status(200).send({
                data: {
                    accessToken: accessToken,
                    refreshToken: refreshToken
                }
            });
        } else {
            res.status(401).send({
                statusCode: 1001,
                data: {},
                message: "invalid password"
            });
        }
    })
});

// signtoken 발행
// Todo: socialType 받아서 socialType 별 signToken 발행 구현  
router.post('/signToken', async(req, res) => {
    const signToken = jwt.sign(req.body.name, req.body.emailToken, req.body.pwd);
    res.status(200).send({ 
        data: { 
            signToken: signToken
        }
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
router.post('/sendVerifyCode', async(req, res) => {
    let randomNumber = Math.floor(Math.random() * 1000000);
    let verifyCode = ('000000' + randomNumber).slice(-6);
    let emailTemplete;
    ejs.renderFile(appDir+'/template/authMail.ejs', {authCode : verifyCode}, function (err, data) {
        if(err){console.log(err)}
        emailTemplete = data;
    });
    const transporter = nodemailer.createTransport({
        service: 'gmail',
        host: 'smtp.gmail.com',
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
        subject: '[MEETable] 회원가입을 위한 인증번호 안내',
        html: emailTemplete,
    };
    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            return res.status(500).json({
                statusCode: 500,
                data: {},
                message: `Failed to send authentication email to ${req.body.email}`
            });
        } 
        cache.put(req.body.email, verifyCode, 180000);
        res.status(200).send({
            data: {},
            message: `Successfully send authentication email to ${req.body.email}` 
        });
        transporter.close();
    });
});

// 인증번호 검증
router.post('/confirmVerifyCode', async(req, res) =>{
    const code = cache.get(req.body.email);
    if (!code) {
        res.status(404).send({ 
            statucCode: 1100,
            data: {},
            message: "verify code doesn't exist. expired or not created",
        });
    } else if (code != req.body.verifyCode) {
        res.status(401).send({
            statusCode: 1110,
            data: {},
            message: "wrong verify code"
        });
    } else {
        cache.del(req.body.email);
        const emailToken = jwt.email(req.body.email);
        return res.status(201).send({ 
            data: {
                emailToken: emailToken
            }
        });
    }
});

//로그아웃
router.post('/logout', authJWT, async (req, res, next) => {
    const delRefresh = await jwt.logout(req.email);
    if (delRefresh === false) {
        res.status(404).send({
            statusCode: 1130,
            data: {},
            message: "refresh token not found"
        })
    } else {
        res.status(200).send({
            data: {
                isLogout: true
            }
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
            data: {},
            message: "member not found" 
        })
    } else {
        res.status(200).send({
            data: {
                isMember: true
            }
        })
    }
});

// 비밀번호 재설정 존재하는 이메일일 때만 실행가능
router.patch('/resetpwd', async(req, res)=> {
    const emailVerified = jwt.emailVerify(req.body.emailToken); 
    if (emailVerified === false) {
        return res.status(400).json({
            statusCode: 1120,
            data: {},
            message: "invalid email token, email token expired" 
        })
    }
    bcrypt.genSalt(saltRounds, (err, salt) => {
        bcrypt.hash(req.body.pwd, salt, (err, encrypted) => {
            db.promise().query(`
                UPDATE member SET member_pwd = '${encrypted}' WHERE member_email = '${emailVerified}'
            `).then(() => {
                res.status(200).send({
                    data: {
                        updatePWD: true
                    }
                })
            })
        })
    })
});
module.exports = router;