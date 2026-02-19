import React, { useEffect, useRef, useState } from "react";

/* =====================================================
   型定義
===================================================== */
type Tsum = {
  id: number;
  x: number;
  y: number;
  color: number;
  rot: number;
  selected: boolean;
  freezeStage: 0 | 1 | 2 | 3;
};

/* =====================================================
   定数
===================================================== */
const FIELD_SIZE = 360;
const VIEW_SIZE = 440;
const OFFSET = (VIEW_SIZE - FIELD_SIZE) / 2;

const TSUM_COUNT = 45;
const TSUM_RADIUS = FIELD_SIZE / 7 / 2;
const TSUM_DIAM = TSUM_RADIUS * 2;

const COLORS = ["#FF6B6B", "#FFD166", "#06D6A0", "#C77DFF"];
const FREEZE_COLORS = [
  "",
  "rgba(150,200,255,0.85)",
  "rgba(80,150,255,0.8)",
  "rgba(30,90,200,0.8)",
];

/* 枠（判定） */
const LEFT_WALL_X = TSUM_RADIUS - TSUM_RADIUS / 2;
const RIGHT_WALL_X = FIELD_SIZE - TSUM_RADIUS / 2;

/* 床（曲線） */
const FLOOR_SAG = TSUM_RADIUS * 1.2;
const floorY = (x: number) => {
  const c = FIELD_SIZE / 2;
  const nx = (x - c) / c;
  return FIELD_SIZE - TSUM_RADIUS + FLOOR_SAG * (1 - nx * nx);
};

/* 生成用 */
const ROLL_STEP = TSUM_RADIUS * 0.45;
const ROLL_TRIES = 500;

/* なぞり */
const BASE_LINK_DIST = TSUM_DIAM * 0.7;
const BOOST_MULT = 1.35;
const MAX_TRACE_DIST = TSUM_DIAM * 0.9;
const FREEZE_MIN_CHAIN = 3;

/* 時間 */
const TIME_LIMIT_MS = 30_000;
const WARNING_TIME_MS = 3_000;


const drawHex = (ctx: CanvasRenderingContext2D, r: number) => {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = Math.PI / 3 * i + Math.PI / 6; // 30度回転
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;

    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
};



/* =====================================================
   メイン
===================================================== */
export default function TsumPractice() {
  /* ---------- スコア ---------- */
  const [freezeCount, setFreezeCount] = useState(0); // 総凍結回数
  const [resetCount, setResetCount] = useState(0);   // 盤面リセット回数
  const [traceCount, setTraceCount] = useState(0);   // 今の盤面でのなぞり回数
  const [coinScore, setCoinScore] = useState(0);     // コイン近似
  const totalScore = freezeCount + resetCount + coinScore;

  /* ---------- 状態 ---------- */
  const [gameOver, setGameOver] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const linkSound = useRef<HTMLAudioElement | null>(null);
const deleteSound = useRef<HTMLAudioElement | null>(null);
  const tsumsRef = useRef<Tsum[]>([]);

  const draggingRef = useRef(false);
  const chainRef = useRef<number[]>([]);
  const chainColorRef = useRef<number | null>(null);
  const justDraggedRef = useRef(false);

  /* 凍結円用スナップショット */
  const frozenSnapshotRef = useRef<Set<number>>(new Set());

  /* タイマー */
  const gameStartTimeRef = useRef(0);
  const timerIdRef = useRef<number | null>(null);

  /* =====================================================
     初期化
  ===================================================== */
 useEffect(() => {
 // linkSound.current = new Audio("/link.mp3");
 // deleteSound.current = new Audio("/delete.mp3");

  return stopTimer;
}, []);

  /* =====================================================
     タイマー
  ===================================================== */
  const startTimer = () => {
    stopTimer();
    gameStartTimeRef.current = Date.now();
    timerIdRef.current = window.setInterval(() => {
      draw();
      if (Date.now() - gameStartTimeRef.current >= TIME_LIMIT_MS) {
        stopTimer();
        finalizeCoin();
        setGameOver(true);
      }
    }, 100);
  };

  const stopTimer = () => {
    if (timerIdRef.current !== null) {
      clearInterval(timerIdRef.current);
      timerIdRef.current = null;
    }
  };

  /* =====================================================
     盤面生成（衝突あり）
  ===================================================== */
  const generateBoard = (): Tsum[] => {
    const placed: Tsum[] = [];

    for (let id = 0; id < TSUM_COUNT; id++) {
      const baseX =
        TSUM_RADIUS + Math.random() * (FIELD_SIZE - TSUM_DIAM);

      let bestX = baseX;
      let bestY = findLowestY(baseX, placed);

      for (let i = 1; i <= ROLL_TRIES; i++) {
        for (const dir of [-1, 1]) {
          const tryX = clamp(
            baseX + dir * ROLL_STEP * i,
            LEFT_WALL_X,
            RIGHT_WALL_X
          );
          const y = findLowestY(tryX, placed);
          if (y > bestY + TSUM_RADIUS * 0.1) {
            bestX = tryX;
            bestY = y;
          }
        }
      }

      placed.push({
        id,
        x: bestX,
        y: bestY,
        color: Math.floor(Math.random() * COLORS.length),
        rot: Math.random() * Math.PI * 2,
        selected: false,
        freezeStage: 0,
      });
    }

    return placed;
  };

  const findLowestY = (x: number, placed: Tsum[]) => {
    let y = floorY(x);
    for (const o of placed) {
      const dx = Math.abs(o.x - x);
      if (dx < TSUM_DIAM) {
        const dy = Math.sqrt(TSUM_DIAM * TSUM_DIAM - dx * dx);
        y = Math.min(y, o.y - dy);
      }
    }
    return y;
  };

  const clamp = (v: number, min: number, max: number) =>
    Math.max(min, Math.min(max, v));

  /* =====================================================
     スコア確定
  ===================================================== */
  const finalizeCoin = () => {
    let coin = 0;
    if (traceCount >= 5) coin = 800;
    else if (traceCount === 4) coin = 400;
    else if (traceCount === 3) coin = 200;

    setCoinScore(c => c + coin);
    setTraceCount(0);
  };

  /* =====================================================
     リセット
  ===================================================== */
  const resetBoardOnly = () => {
(deleteSound.current?.cloneNode(true) as HTMLAudioElement)?.play();
    setResetCount(c => c + 1);
    finalizeCoin();
    tsumsRef.current = generateBoard();
    chainRef.current = [];
    chainColorRef.current = null;
    draggingRef.current = false;
    frozenSnapshotRef.current = new Set();
    draw();
  };

  const resetGame = () => {
    setFreezeCount(0);
    setResetCount(0);
    setTraceCount(0);
    setCoinScore(0);
    setGameOver(false);
    tsumsRef.current = generateBoard();
    startTimer();
    draw();
  };

  /* =====================================================
     座標
  ===================================================== */
  type PointerEvent =
  | React.MouseEvent<HTMLCanvasElement>
  | React.TouchEvent<HTMLCanvasElement>;

const getPointerPos = (e: PointerEvent) => {
  const rect = canvasRef.current!.getBoundingClientRect();

  let clientX: number;
  let clientY: number;

  if ("touches" in e) {
    const t = e.touches[0] || e.changedTouches[0];
    clientX = t.clientX;
    clientY = t.clientY;
  } else {
    clientX = e.clientX;
    clientY = e.clientY;
  }

  return {
    x: clientX - rect.left - OFFSET,
    y: clientY - rect.top - OFFSET,
  };
};

  /* =====================================================
     なぞり判定
  ===================================================== */
  const handleStart = (x: number, y: number) => {
 if (!gameStartTimeRef.current) resetGame();  
  if (gameOver) return;


  draggingRef.current = true;
  justDraggedRef.current = false;

  frozenSnapshotRef.current = new Set(
    tsumsRef.current.filter(t => t.freezeStage > 0).map(t => t.id)
  );

  tryAdd(x, y);
  draw();
};

const handleMove = (x: number, y: number) => {
  if (!draggingRef.current || gameOver) return;

  justDraggedRef.current = true;
  tryAdd(x, y);
  draw();
};

const handleEnd = () => {
  if (gameOver) return;

  draggingRef.current = false;

  if (chainRef.current.length >= 2) {
    setTraceCount(c => c + 1);
  }

  applyFreeze();

  for (const t of tsumsRef.current) t.selected = false;
  chainRef.current = [];
  chainColorRef.current = null;

  draw();
};

const isHit = (t: Tsum, mx: number, my: number) => {
    if (t.freezeStage > 0) return false;
    const dx = t.x - mx;
    const dy = t.y - my;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const limit =
      chainRef.current.length === 0
        ? BASE_LINK_DIST
        : BASE_LINK_DIST * BOOST_MULT;
    return dist <= limit;
  };

  /* ---- 安全Undo（最後の1個だけ戻れる） ---- */
  const tryUndoLast = (mx: number, my: number) => {
    if (chainRef.current.length < 2) return false;
    const prevId = chainRef.current.at(-2)!;
    const prev = tsumsRef.current.find(t => t.id === prevId)!;
    const dx = prev.x - mx;
    const dy = prev.y - my;
    if (dx * dx + dy * dy <= (TSUM_RADIUS * 0.9) ** 2) {
      const lastId = chainRef.current.pop()!;
      tsumsRef.current.find(t => t.id === lastId)!.selected = false;
      return true;
    }
    return false;
  };

  const tryAdd = (mx: number, my: number) => {
    if (tryUndoLast(mx, my)) return;

    if (chainRef.current.length > 0) {
      const last =
        tsumsRef.current.find(
          t => t.id === chainRef.current.at(-1)!
        )!;
      const dx = last.x - mx;
      const dy = last.y - my;
      if (dx * dx + dy * dy > MAX_TRACE_DIST * MAX_TRACE_DIST) return;
    }

    for (const t of tsumsRef.current) {
      if (t.selected || t.freezeStage > 0) continue;

      if (chainRef.current.length === 0) {
        if (!isHit(t, mx, my)) continue;
        t.selected = true;
        chainColorRef.current = t.color;
        chainRef.current.push(t.id);
(linkSound.current?.cloneNode(true) as HTMLAudioElement)?.play();
        return;
      }

      if (t.color !== chainColorRef.current) continue;
      if (!isHit(t, mx, my)) continue;

      t.selected = true;
      chainRef.current.push(t.id);

      return;
    }
  };

  /* =====================================================
     凍結（直線＋円）
  ===================================================== */
  const applyFreeze = () => {
    if (chainRef.current.length < FREEZE_MIN_CHAIN) return;
    setFreezeCount(c => c + 1);

    const s = tsumsRef.current.find(t => t.id === chainRef.current[0])!;
    const e = tsumsRef.current.find(
      t => t.id === chainRef.current.at(-1)!
    )!;

    // 直線凍結（無限直線）
    for (const t of tsumsRef.current) {
      if (t.freezeStage >= 3) continue;
      const A = e.y - s.y;
      const B = s.x - e.x;
      const C = e.x * s.y - s.x * e.y;
      const d = Math.abs(A * t.x + B * t.y + C) / Math.sqrt(A * A + B * B);
      if (d <= TSUM_RADIUS) {
        t.freezeStage = Math.min(3, t.freezeStage + 1)as 0 | 1 | 2 | 3;
      }
    }

    // 円凍結（スナップショット起点）
    const r2 = (TSUM_DIAM * 2) ** 2;
    for (const id of frozenSnapshotRef.current) {
      const src = tsumsRef.current.find(t => t.id === id);
      if (!src) continue;
      for (const t of tsumsRef.current) {
        if (t.freezeStage >= 3) continue;
        const dx = t.x - src.x;
        const dy = t.y - src.y;
        if (dx * dx + dy * dy <= r2) {
          t.freezeStage = Math.min(3, t.freezeStage + 1)as 0 | 1 | 2 | 3;
        }
      }
    }
  };

  /* =====================================================
     描画
  ===================================================== */
  const draw = () => {
    const ctx = canvasRef.current!.getContext("2d")!;
    ctx.clearRect(0, 0, VIEW_SIZE, VIEW_SIZE);

    /* --- 時間ゲージ --- */
    const elapsed = Date.now() - gameStartTimeRef.current;
    const remain = Math.max(0, TIME_LIMIT_MS - elapsed);
    const ratio = remain / TIME_LIMIT_MS;
    const barH = TSUM_RADIUS * 0.6;

    ctx.fillStyle =
      remain <= WARNING_TIME_MS ? "#ff4d4d" : "#4caf50";
    ctx.fillRect(0, 0, VIEW_SIZE * ratio, barH);
    ctx.strokeStyle = "#333";
    ctx.strokeRect(0, 0, VIEW_SIZE, barH);

    ctx.save();
    ctx.translate(OFFSET, OFFSET);

    /* --- チェーン線 --- */
    if (chainRef.current.length >= 2) {
      ctx.lineWidth = TSUM_RADIUS * 0.4;
      ctx.beginPath();
      chainRef.current.forEach((id, i) => {
        const t = tsumsRef.current.find(v => v.id === id)!;
        if (i === 0) ctx.moveTo(t.x, t.y);
        else ctx.lineTo(t.x, t.y);
      });
      ctx.strokeStyle = "rgba(100,100,100,0.6)";
      ctx.stroke();
    }

    /* --- ツム --- */
    for (const t of tsumsRef.current) {
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rot);

      ctx.fillStyle = COLORS[t.color];
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        TSUM_RADIUS * 0.9,
        TSUM_RADIUS,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();

    if (t.freezeStage > 0) {
  ctx.fillStyle = FREEZE_COLORS[t.freezeStage];
  drawHex(ctx, TSUM_RADIUS);
  ctx.fill();
}

      ctx.restore();
    }

    /* --- 床 --- */
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= FIELD_SIZE; x += 2) {
      const y = floorY(x) + TSUM_RADIUS;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "#aaa";
    ctx.stroke();

    /* --- 左右枠 --- */
    ctx.beginPath();
    ctx.moveTo(LEFT_WALL_X - TSUM_RADIUS, 0);
    ctx.lineTo(LEFT_WALL_X - TSUM_RADIUS, FIELD_SIZE);
    ctx.moveTo(RIGHT_WALL_X + TSUM_RADIUS, 0);
    ctx.lineTo(RIGHT_WALL_X + TSUM_RADIUS, FIELD_SIZE);
    ctx.stroke();

    ctx.restore();
  };

  /* =====================================================
     JSX
  ===================================================== */
 return (
  <div style={{ position: "relative", width: VIEW_SIZE, margin: "0 auto" }}>
    <canvas
      ref={canvasRef}
      width={VIEW_SIZE}
      height={VIEW_SIZE}

  
      onMouseDown={e => {
        const p = getPointerPos(e);
        handleStart(p.x, p.y);
      }}
      onMouseMove={e => {
        const p = getPointerPos(e);
        handleMove(p.x, p.y);
      }}
      onMouseUp={handleEnd}

      /* ===== touch ===== */
      onTouchStart={e => {
        e.preventDefault();
        const p = getPointerPos(e);
        handleStart(p.x, p.y);
      }}
      onTouchMove={e => {
        e.preventDefault();
        const p = getPointerPos(e);
        handleMove(p.x, p.y);
      }}
     onTouchEnd={e => {
  e.preventDefault();

  // ドラッグしていなかった = タップ
  if (!justDraggedRef.current) {
    const p = getPointerPos(e);

    for (const t of tsumsRef.current) {
      if (t.freezeStage > 0) {
        const dx = t.x - p.x;
        const dy = t.y - p.y;
        if (dx * dx + dy * dy <= TSUM_RADIUS * TSUM_RADIUS) {
          resetBoardOnly();
          return;
        }
      }
    }
  }

  justDraggedRef.current = false;
  handleEnd();
}}

      onClick={e => {
        if (gameOver) return;
        if (justDraggedRef.current) {
          justDraggedRef.current = false;
          return;
        }
        const p = getPointerPos(e);
        for (const t of tsumsRef.current) {
          if (t.freezeStage > 0) {
            const dx = t.x - p.x;
            const dy = t.y - p.y;
            if (dx * dx + dy * dy <= TSUM_RADIUS * TSUM_RADIUS) {
              resetBoardOnly();
              return;
            }
          }
        }
      }}

      style={{
        background: "#5A5A5A",
        display: "block",
        touchAction: "none",       
        pointerEvents: gameOver ? "none" : "auto",
      }}
    />

    {gameOver && (
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "rgba(0,0,0,0.75)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          color: "#fff",
        }}
      >
        <h2>TIME UP</h2>
        <p>凍結回数: {freezeCount}</p>
        <p>消去回数: {resetCount}</p>
        <p>コイン近似: {coinScore}</p>
        <hr />
        <p style={{ fontSize: 28 }}>TOTAL: {totalScore}</p>
        <button
          onClick={resetGame}
          style={{ padding: "12px 24px", fontSize: 16 }}
        >
          最初から
        </button>
      </div>
    )}
  </div>
);

}