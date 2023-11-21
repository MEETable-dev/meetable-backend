const express = require('express');
const router = express.Router();
const db = require('../db');
const authMember = require('../middlewares/authmember');

//즐겨찾기 업데이트
router.patch('/bookmark', authMember, async(req, res) => {
    if (req.isMember === true) {
        await db.promise().query(`
            UPDATE memberjoin SET is_bookmark = '${req.body.isBookmark}' WHERE member_id = ${req.memberId} AND promise_id = ${req.body.promiseId};
        `).then( () => {
            res.status(200).send({
                data: {
                    updateBookmark: true
                },
                message: "bookmark update succeed"
            })
        })
    } else {
        res.status(401).send({
            statusCode: 1000,
            data: {},
            message: "access denied."
        });
    }
});

//폴더 생성
router.post('/folder', authMember, async(req, res) => {
    if (req.isMember === true) {
        await db.promise().query(`
            INSERT INTO folder(folder_name, member_id)
            VALUES('${req.body.folder_name}', ${req.memberId})
        `).then( () => {
            res.status(201).send({
                data: {
                    createFolder: true
                },
                message: "folder created"
            })
        })
    } else {
        res.status(401).send({
            statusCode: 1000,
            data: {},
            message: "access denied."
        });
    }
});

// 폴더명 변경

// 폴더 삭제

// 폴더에 약속 추가

// 전체 약속 목록 불러오기

// 즐겨찾기한 약속 목록 불러오기

// 약속/폴더 내용 검색



module.exports = router;