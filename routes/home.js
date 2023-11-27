const express = require('express');
const router = express.Router();
const db = require('../db');
const authMember = require('../middlewares/authmember');

//즐겨찾기 업데이트
router.patch('/bookmark', authMember, async(req, res) => {
    if (req.isMember === true) {
        const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
        await db.promise().query(`
            UPDATE memberjoin 
            SET is_bookmark = '${req.body.isBookmark}', last_bookmarked_at = '${now}' 
            WHERE member_id = ${req.memberId} AND promise_id = ${req.body.promiseId};
        `).then( () => {
            res.status(200).send({
                updateBookmark: true,
                message: "bookmark update succeed"
            })
        })
    } else {
        res.status(401).send({
            statusCode: 1000,
            message: "access denied."
        });
    }
});

//폴더 생성
router.post('/folder', authMember, async(req, res) => {
    if (req.isMember === true) {
        result = await db.promise().query(`
            INSERT INTO folder(folder_name, member_id)
            VALUES('${req.body.folderName}', ${req.memberId})
        `);
        folderId = result[0].insertId;
        res.status(201).send({
            folderId: folderId,
            createFolder: true,
            message: "folder created"
        })
    } else {
        res.status(401).send({
            statusCode: 1000,
            message: "access denied."
        });
    }
});

// 폴더명 변경
router.patch('/folder', authMember, async(req, res) => {
    if (req.isMember === true) {
        await db.promise().query(`
            UPDATE folder
            SET folder_name = '${req.body.folderName}'
            WHERE folder_id = ${req.body.folderId} AND member_id = ${req.memberId}
        `).then( () => {
            res.status(200).send({
                folderNameChanged: true,
                message: "folder name changed"
            })
        })
    } else {
        res.status(401).send({
            statusCode: 1000,
            message: "access denied."
        });
    }
});

// 즐겨찾기 및 전체 폴더/약속 목록 불러오기
router.get('/totalpromise', authMember, async(req, res) => {
    if (req.isMember === true) {
        try {
            let promises;
            let bookmarked;
            bookmarked = await db.promise().query(`
                SELECT p.promise_name, p.promise_id, p.promise_code, mj.is_bookmark, mj.last_bookmarked_at
                FROM folder f
                JOIN folder_promise fp ON f.folder_id = fp.folder_id
                JOIN promise p ON fp.promise_id = p.promise_id
                JOIN memberjoin mj ON p.promise_id = mj.promise_id AND mj.member_id = ${req.memberId}
                WHERE mj.is_bookmark = 'T' AND f.member_id = ${req.memberId} AND f.folder_name = 'meetable'
                ORDER BY mj.last_bookmarked_at DESC;
            `)
            if (req.query.sortBy == "name") {
                promises = await db.promise().query(`
                    SELECT p.promise_name, p.promise_id, p.promise_code, mj.is_bookmark
                    FROM folder f
                    JOIN folder_promise fp ON f.folder_id = fp.folder_id
                    JOIN promise p ON fp.promise_id = p.promise_id
                    LEFT JOIN memberjoin mj ON p.promise_id = mj.promise_id AND mj.member_id = ${req.memberId}
                    WHERE f.member_id = ${req.memberId} AND f.folder_name = 'meetable'
                    ORDER BY p.promise_name;
                `);
            } else if (req.query.sortBy == "id") {
                promises = await db.promise().query(`
                    SELECT p.promise_name, p.promise_id, p.promise_code, mj.is_bookmark
                    FROM folder f
                    JOIN folder_promise fp ON f.folder_id = fp.folder_id
                    JOIN promise p ON fp.promise_id = p.promise_id
                    LEFT JOIN memberjoin mj ON p.promise_id = mj.promise_id AND mj.member_id = ${req.memberId}
                    WHERE f.member_id = ${req.memberId} AND f.folder_name = 'meetable'
                    ORDER BY p.promise_id;
                `);
            }
            if (bookmarked !== undefined && promises !== undefined) {
                const bookmarkFormat = bookmarked[0].map(row => ({
                    promiseName: row.promise_name,
                    promiseCode: row.promise_id + "_" + row.promise_code
                }))
                const promiseFormat = promises[0].map(row => ({
                    promiseName: row.promise_name,
                    promiseCode: row.promise_id + "_" + row.promise_code,
                    isBookmark: row.is_bookmark
                }));
                res.status(200).send({
                    bookmark: bookmarkFormat,
                    promise: promiseFormat,
                    sortBy: req.query.sortBy,
                    message: "member total promise list"
                })
            } else if (bookmarked === undefined) {
                const promiseFormat = promises[0].map(row => ({
                    promiseName: row.promise_name,
                    promiseCode: row.promise_id + "_" + row.promise_code,
                    isBookmark: row.is_bookmark
                }));
                res.status(200).send({
                    bookmark: {},
                    promise: promiseFormat,
                    sortBy: req.query.sortBy,
                    message: "member total promise list"
                })
            } else if (bookmarked === undefined && promises === undefined) {
                res.status(200).send({
                    bookmark: {},
                    promise: {},
                    sortBy: req.query.sortBy,
                    message: "member total promise list"
                })
            }
            
            

        } catch (err) {
            res.status(500).send({
                message: `Error retreving promises: ${err.message}`
            })
        }
    } else {
        res.status(401).send({
            statusCode: 1000,
            message: "access denied."
        });
    }
});

// 폴더 삭제
// router.delete('/folder', authMember, async(req, res) => {

// });

// 폴더에 약속 추가
// router.post('/folderpromise', authMember, async(req, res) => {

// });

// 폴더에서 약속 제거
// router.delete('/folderpromise', authMember, async(req, res) => {

// });

// 약속 삭제
router.delete('/promise', authMember, async(req, res) => {

});

// 약속/폴더 내용 검색
router.get('/search', authMember, async(req, res) => {

});


// 인원수 체크(for 약속에서 빠지기)
router.get('/checkpeople', authMember, async(req, res) => {

});

// 약속에서 빠지기
router.post('/backoutpromise', authMember, async(req, res) => {

});



module.exports = router;