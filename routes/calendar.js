const express = require('express');
const router = express.Router();
const db = require('../db');
const authMember = require("../middlewares/authmember");

router.post("/add", authMember, async (req, res) => {
    if (req.isMember === false) {
        return res.status(401).json({
            statusCode: 1000,
            message: "access denied. only members can add a schedule.",
        });
    }

    const memberId = req.memberId;
    const {
        color,
        name,
        place,
        memo,
        isreptition,
        scheduleTimes,
        reptitioncycle,
        iscontinuous,
        reptition_time,
        end_date,
    } = req.body;

    // 입력값 검증
    if (!(color >= 0 && color <= 8) || !name || !Array.isArray(scheduleTimes)) {
        return res.status(400).json({
            message: "Invalid input. Please provide the correct data.",
        });
    }

    try {
        // calendar 테이블에 데이터 삽입
        const [calendarResult] = await db.promise().query(
            `
            INSERT INTO CALENDAR (member_id, schedule_color, schedule_name, schedule_place, schedule_memo, isreptition, reptitioncycle, iscontinuous, reptition_time, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
            [
                memberId,
                color,
                name,
                place,
                memo,
                isreptition || "F",
                reptitioncycle || 0,
                iscontinuous || "F",
                reptition_time || 0,
                end_date,
            ]
        );

        const calendarId = calendarResult.insertId;

        // scheduleTimes 배열을 사용하여 calendartime 테이블에 여러 날짜와 시간 데이터 삽입
        scheduleTimes.forEach(async (scheduleTime) => {
            const [date, startTime, endTime] = scheduleTime.split(" ");

            await db.promise().query(
                `
                INSERT INTO CALENDARTIME (calendar_id, calendar_date, start_time, end_time)
                VALUES (?, ?, ?, ?)
            `,
                [calendarId, date, startTime, endTime]
            );
        });

        res.status(201).json({
            message:
                "Schedule added successfully with multiple dates and times.",
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            message: `Error adding schedule: ${error.message}`,
        });
    }
});

router.delete("/delete", authMember, async (req, res) => {});

router.patch("/update", authMember, async (req, res) => {});

router.get("/monthinfo", authMember, async (req, res) => {});

router.get("/dayinfo", authMember, async (req, res) => {});

module.exports = router;