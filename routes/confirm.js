const express = require("express");
const router = express.Router();
const db = require("../db");
const authMember = require("../middlewares/authmember");

//확정권한 있는 사람만 확정하기 가능(비회원인 경우 전체 허용일 경우만 가능 회원은 memberjoin 내 권한으로 확인)
//confirmed table에 promiseId, place, notice 넣어서 만든 후 confirmedtime table에도 시간 추가
router.post("/add", authMember, async (req, res) => {});

// 확정 권한이 있는 회원/비회원은 확정을 수정할 수 있음(공지사항, 장소)
router.patch("/update", authMember, async (req, res) => {});

// 확정권한이 있는 회원/비회원은 확정을 취소할 수 있음
// 확정 취소 시 캘린더에 연동한 회원의 일정이 모두 삭제됨
router.delete("/cancel", authMember, async (req, res) => {});

// 확정된 약속을 표시하는 것은 약속세부 가져오기를 수정하는 것이 좋을듯
// 같은 맥락으로 (회원) 내 캘린더에 약속이 있는 경우에도 일정있는 날짜임을 표시해야함

// 내 캘린더에 연동하는 경우 장소, 공지사항은 수정이 불가능하고 회원만 가능하다. 일정명은 기본적으로 약속명이고 시간정보가 입력되어있다(calendartime 기반)

// 내 캘린더에 연동할 때 기본으로 가져올 정보들(약속명, 장소, 공지사항, 시간정보)
router.get("confirminfo", authMember, async (req, res) => {});

// 내 캘린더에 연동하기
// 시간정보가 없는 약속의 경우 회원이 직접 추가해야함(기본 00~24)
// 시간정보가 있는 약속은 시간정보를 수정할 수 없음
// 날짜기준인 경우 반복 정보를 설정할 수 없음
// 요일기준인 경우 반복 정보를 반드시 설정해야함(기본 반복없음, 날짜 입력해야함 언제 월요일인지)
// 약속의 시간정보 여부, 날짜기준 요일 기준에 따라 받아오는 정보가 달라지고 만들어진 calendarId와 promiseId를 calendarpromise table에 mapping 시키는 것 외에는 캘린더에 일반정보를 추가하는 것과 동일하다.
router.post("linktocalendar", authMember, async (req, res) => {});

// 추가적으로 연동 후 캘린더에서 삭제하는 경우에 연동을 해제하는 것이므로 calendarpromise table에서 mapping을 삭제하면 된다. -> /caledar/delete에서 추가

module.exports = router;
