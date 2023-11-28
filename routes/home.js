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
    if (req.query.sortBy === undefined) {
        res.status(400).send({
            statusCode: 1024,
            message: "required query missed: sortBy"
        })
    }
    if (req.isMember === true) {
        try {
            let promises;
            let bookmarked;
            bookmarked = await db.promise().query(`
                SELECT p.promise_name, p.promise_id, p.promise_code, mj.is_bookmark, mj.last_bookmarked_at,
                (SELECT COUNT(*) FROM memberjoin WHERE promise_id = p.promise_id) +
                (SELECT COUNT(*) FROM nonmember WHERE promise_id = p.promise_id) AS participant_count
                FROM folder f
                JOIN folder_promise fp ON f.folder_id = fp.folder_id
                JOIN promise p ON fp.promise_id = p.promise_id
                JOIN memberjoin mj ON p.promise_id = mj.promise_id AND mj.member_id = ${req.memberId}
                WHERE mj.is_bookmark = 'T' AND f.member_id = ${req.memberId} AND f.folder_name = 'meetable'
                ORDER BY mj.last_bookmarked_at DESC;
            `)
            if (req.query.sortBy == "name") {
                promises = await db.promise().query(`
                    SELECT p.promise_name, p.promise_id, p.promise_code, mj.is_bookmark,
                    (SELECT COUNT(*) FROM memberjoin WHERE promise_id = p.promise_id) +
                    (SELECT COUNT(*) FROM nonmember WHERE promise_id = p.promise_id) AS participant_count
                    FROM folder f
                    JOIN folder_promise fp ON f.folder_id = fp.folder_id
                    JOIN promise p ON fp.promise_id = p.promise_id
                    LEFT JOIN memberjoin mj ON p.promise_id = mj.promise_id AND mj.member_id = ${req.memberId}
                    WHERE f.member_id = ${req.memberId} AND f.folder_name = 'meetable'
                    ORDER BY p.promise_name;
                `);
            } else if (req.query.sortBy == "id") {
                promises = await db.promise().query(`
                    SELECT p.promise_name, p.promise_id, p.promise_code, mj.is_bookmark,
                    (SELECT COUNT(*) FROM memberjoin WHERE promise_id = p.promise_id) +
                    (SELECT COUNT(*) FROM nonmember WHERE promise_id = p.promise_id) AS participant_count
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
                    count: row.participant_count,
                    promiseName: row.promise_name,
                    promiseCode: row.promise_id + "_" + row.promise_code,
                    isBookmark: row.is_bookmark
                }))
                const promiseFormat = promises[0].map(row => ({
                    count: row.participant_count,
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
            } else if (bookmarked === undefined && promises !== undefined) {
                const promiseFormat = promises[0].map(row => ({
                    count: row.participant_count,
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
                statusCode: 1234,
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

// 약속 삭제
router.patch('/deletepromise', authMember, async(req, res) => {
    if (req.isMember === true) {
        try {
            const promiseId = req.body.promiseId;
            const memberId = req.memberId;

            // 사용자의 'trash' 폴더 ID 찾기
            const [findFolderResult] = await db.promise().query(`
                SELECT folder_id FROM folder 
                WHERE member_id = ${memberId} AND folder_name = 'trash'
            `);

            const trashFolderId = findFolderResult[0].folder_id;
            
            // 약속을 'trash' 폴더로 옮기기
            await db.promise().query(`
                UPDATE folder_promise
                SET folder_id = ${trashFolderId}
                WHERE promise_id = ${promiseId}
            `);

            await db.promise().query(`
                UPDATE memberjoin
                SET is_bookmark = 'F'
                WHERE member_id = ${memberId} AND promise_id = ${promiseId}
            `);

            res.status(200).send({
                movedtoTrash: true,
                message: "Promise moved to trash successfully"
            });
        } catch (error) {
            console.log(error);
            res.status(500).send({
                statusCode: 1234,
                message: `Error moving promise to trash: ${error.message}`
            });
        }
    } else {
        res.status(401).send({
            statusCode: 1000,
            message: "Access denied."
        });
    }
});

//휴지통 약속 가져오기
router.get('/trash', authMember, async(req, res) => {
    if (req.query.sortBy === undefined) {
        res.status(400).send({
            statusCode: 1024,
            message: "required query missed: sortBy"
        })
    }
    if (req.isMember === true) {
        try {
            if (req.query.sortBy == "name") {
                trash = await db.promise().query(`
                    SELECT p.promise_name, p.promise_id, p.promise_code,
                    (SELECT COUNT(*) FROM memberjoin WHERE promise_id = p.promise_id) +
                    (SELECT COUNT(*) FROM nonmember WHERE promise_id = p.promise_id) AS participant_count
                    FROM folder f
                    JOIN folder_promise fp ON f.folder_id = fp.folder_id
                    JOIN promise p ON fp.promise_id = p.promise_id
                    LEFT JOIN memberjoin mj ON p.promise_id = mj.promise_id AND mj.member_id = ${req.memberId}
                    WHERE f.member_id = ${req.memberId} AND f.folder_name = 'trash'
                    ORDER BY p.promise_name;
                `);
            } else if (req.query.sortBy == "id") {
                trash = await db.promise().query(`
                    SELECT p.promise_name, p.promise_id, p.promise_code,
                    (SELECT COUNT(*) FROM memberjoin WHERE promise_id = p.promise_id) +
                    (SELECT COUNT(*) FROM nonmember WHERE promise_id = p.promise_id) AS participant_count
                    FROM folder f
                    JOIN folder_promise fp ON f.folder_id = fp.folder_id
                    JOIN promise p ON fp.promise_id = p.promise_id
                    LEFT JOIN memberjoin mj ON p.promise_id = mj.promise_id AND mj.member_id = ${req.memberId}
                    WHERE f.member_id = ${req.memberId} AND f.folder_name = 'trash'
                    ORDER BY p.promise_id;
                `);
            }
            if (trash !== undefined) {
                const trashFormat = trash[0].map(row => ({
                    count: row.participant_count,
                    promiseName: row.promise_name,
                    promiseCode: row.promise_id + "_" + row.promise_code,
                }));
                res.status(200).send({
                    trash: trashFormat,
                    sortBy: req.query.sortBy,
                    message: "trash promise list"
                })
            } else if (trash === undefined) {
                res.status(200).send({
                    trash: {},
                    sortBy: req.query.sortBy,
                    message: "trash promise list"
                })
            }
        } catch (err) {
            res.status(500).send({
                statusCode: 1234,
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

// 약속명 변경
router.patch('/promisename', authMember, async(req, res) => {
    if (req.isMember === true) {
        await db.promise().query(`
            UPDATE memberjoin
            SET member_promise_name = '${req.body.promiseName}'
            WHERE promise_id = ${req.body.promiseId} AND member_id = ${req.memberId}
        `).then( () => {
            res.status(200).send({
                promiseNameChanged: true,
                message: "promise name changed"
            })
        })
    } else {
        res.status(401).send({
            statusCode: 1000,
            message: "access denied."
        });
    }
});

// 약속/폴더 내용 검색
router.get('/search', authMember, async(req, res) => {
    if (req.isMember === true) {
        try {
            const searchTerm = req.query.searchTerm;
            if (!searchTerm) {
                return res.status(400).send({
                    statusCode: 1024,
                    message: "required query missing: searchTerm"
                });
            }

            // promise_name을 기반으로 검색
            const promises = await db.promise().query(`
                SELECT p.promise_name, p.promise_id, p.promise_code, mj.is_bookmark
                (SELECT COUNT(*) FROM memberjoin WHERE promise_id = p.promise_id) +
                (SELECT COUNT(*) FROM nonmember WHERE promise_id = p.promise_id) AS participant_count
                FROM folder f
                JOIN folder_promise fp ON f.folder_id = fp.folder_id
                JOIN promise p ON fp.promise_id = p.promise_id
                LEFT JOIN memberjoin mj ON p.promise_id = mj.promise_id AND mj.member_id = ${req.memberId}
                WHERE f.member_id = ${req.memberId} AND p.promise_name LIKE '%${searchTerm}%' AND f.folder_name = 'meetable'
                ORDER BY p.promise_name;
            `);

            // 결과 포맷팅
            const formattedPromises = promises[0].map(row => ({
                count: row.participant_count,
                promiseName: row.promise_name,
                promiseCode: row.promise_id + "_" + row.promise_code,
                isBookmark: row.is_bookmark
            }));

            res.status(200).send({
                promise: formattedPromises,
                message: "search result"
            });
        } catch (error) {
            res.status(500).send({
                message: `Error searching for promises: ${error.message}`
            });
        }
    } else {
        res.status(401).send({
            statusCode: 1000,
            message: "access denied."
        });
    }
});

// 약속에서 빠지기
router.delete('/backoutpromise', authMember, async(req, res) => {
    const promiseId = req.body.promiseId;
    const isMember = req.isMember; // 회원 여부

    if (!promiseId) {
        return res.status(400).send({
            statusCode: 1024,
            message: "required body missed: promiseId"
        });
    }

    try {
        if (isMember) {
            const memberId = req.memberId; // 회원 ID
            // 회원인 경우, memberjoin 테이블에서 제거
            await db.promise().query(`
                DELETE FROM memberjoin WHERE member_id = ${memberId} AND promise_id = ${promiseId};
            `);
        } else {
            // 비회원인 경우, nonmember 테이블에서 제거
            const nonmemberId = req.nonmemberId; // 비회원 ID
            await db.promise().query(`
                DELETE FROM nonmember WHERE nonmember_id = ${nonmemberId} AND promise_id = ${promiseId};
            `);
        }

        // 참여자 수 확인
        const [participants] = await db.promise().query(`
            SELECT 
                (SELECT COUNT(*) FROM memberjoin WHERE promise_id = ${promiseId}) +
                (SELECT COUNT(*) FROM nonmember WHERE promise_id = ${promiseId}) AS count
        `);

        if (participants[0].count === 1) {
            // 참여자가 1명이면 promise 삭제
            await db.promise().query(`
                DELETE FROM promise WHERE promise_id = ${promiseId};
            `);
        }
        res.status(200).send({
            backedOut: true,
            message: "successfully backed out of the promise"
        });
    } catch (error) {
        console.log(error);
        res.status(500).send({
            message: `Error backing out of promise: ${error.message}`
        });
    }
});

// 휴지통 비우기 return으로 삭제된 약속 이름, 코드 보내자
router.delete('/backoutall', authMember, async(req, res) => {

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

module.exports = router;