const express = require('express');
const router = express.Router();
const db = require('../db');
const bcrypt = require('bcrypt');
const saltRounds = 10;
const jwt = require('../utils/jwt-util');
const redisClient = require('../utils/redis');
const refresh = require('./refresh');


// 회원가입
router.post('/signup', async(req, res) => {
    //signToken 해체
    const signInfoVerified = jwt.signVerify(req.body.signToken);
    if (signInfoVerified === false) {
        res.status(400).send({
            statusCode: 1020, 
            data: {},
            message: "invalid sign token" 
        })
    }
    bcrypt.genSalt(saltRounds, (err, salt) => {
        bcrypt.hash(signInfoVerified.pwd, salt, (err, encrypted) => {
            db.promise().query(`
                INSERT INTO member(member_name, member_email, member_pwd, is_accept_marketing)
                values('${signInfoVerified.name}','${signInfoVerified.email}', '${encrypted}','${req.body.marketingPolicy}')
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
        SELECT member_id, member_pwd FROM member WHERE member_email = '${req.body.email}'
    `)
    if (member.length == 0) {
        res.status(404).send({
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
    const signToken = jwt.sign(req.body.name, req.body.email, req.body.pwd);
    res.status(200).send({ 
        data: { 
            signToken: signToken
        }
    });
});

// access token 재발급
router.post('/token', refresh);

router.get('/test', (req, res) => {
    if (req.headers) {
        const accessToken = (req.headers.authorization).split('Bearer ')[1];
        res.status(200).send({message: `hello ${accessToken}`})
    } else {
        res.status(200).send({message: "hello anyone"});
    }
    

    

});


module.exports = router;