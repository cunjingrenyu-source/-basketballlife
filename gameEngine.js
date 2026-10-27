 // =========================================================
        // 【第1章】状態管理 (gameState) の導入 ＋ 【AI監督の超絶頭脳】
        // 試合全体の状態と、AI監督が戦術判断に使うメタデータを一元管理
        // =========================================================
        const gameState = {
            isHomeOffense: Math.random() > 0.5,
            currentQ: 1,
            maxQ: 4,
            isOverTime: false,
            clock: 720,
            shotClock: 24,
            isFastBreak: false,
            phase: 'live',
            // --- AI監督用 モメンタム＆タイムアウト管理 ---
            homeRun: 0,        // ホームチームの連続得点
            awayRun: 0,        // アウェイチームの連続得点
            homeTimeouts: 7,
            awayTimeouts: 7,
            // --- AI戦術状態フラグ ---
            homeStrategy: { focus: 'balanced', intensity: 'normal', defense: 'man' },
            awayStrategy: { focus: 'balanced', intensity: 'normal', defense: 'man' }
        };

        // 🔴【新機能】モメンタムリセット（攻守交代時ではなく、相手が得点した時にリセット）
        const updateMomentum = (scoringSide, pts) => {
            if (scoringSide === 'home') {
                gameState.homeRun += pts;
                gameState.awayRun = 0;
            } else {
                gameState.awayRun += pts;
                gameState.homeRun = 0;
            }
        };


        // 試合開始前に全選手へ「実質ステータス(currentStats)」を付与
        if (hTeam && hTeam.roster) hTeam.roster.forEach(p => p.currentStats = getEffectiveStats(p));
        if (aTeam && aTeam.roster) aTeam.roster.forEach(p => p.currentStats = getEffectiveStats(p));

           // 🔴【第1章】攻守交代・時計・速攻フラグを一元管理する絶対関数（gameState連動）
        // この関数を通さない限り攻守は交代しない。これにより不整合を100%防ぐ。
        const switchPossession = (resetClockTo = 24, nextFastBreak = false) => {
            gameState.isHomeOffense = !gameState.isHomeOffense;
            gameState.shotClock = resetClockTo;
            gameState.isFastBreak = nextFastBreak;
            gameState.phase = 'live'; // 攻守交代で必ずライブ状態に戻る
        };

        // 🔴【第1章】攻撃権を維持したまま時計だけリセットする関数（ORB用）
        const keepPossession = (resetClockTo = 14) => {
            gameState.shotClock = resetClockTo;
            gameState.isFastBreak = false; // ORB後は必ずハーフコートオフェンス
            gameState.phase = 'live';
        };

        // 🔴【第1章】タイマーの共通減算処理
        // 試合時計とショットクロックを同時に減算し、0未満にならないように保護する
        const consumeTime = (seconds) => {
            let actualSpent = Math.min(gameState.clock, seconds);
            gameState.clock -= actualSpent;
            gameState.shotClock -= actualSpent;
            return actualSpent;
        };
        // =========================================================
// 【演出データベース＆選択システム】（課題3-1〜3-11完全対応）
// 乱数の使い回しを廃止し、能力・状況・乱数の独立抽選で演出を決定する
// =========================================================

const playDb = {
    three: [
        { type: "god", condition: (s, d, cl, clk, diff) => s.three > 120 && clk < 10, prob: 0.05, text: "{shooter}がロゴ付近から放つディープスリー！！美しい弧を描きネットを揺らした！！！", high: true },
        { type: "rare", condition: (s, d, cl, clk, diff) => s.three > 90 && cl === "Smothered", prob: 0.15, text: "<span style='color:#e74c3c; font-weight:bold;'>【タフショット！】</span>ディフェンスがガチガチに密着する中、{shooter}が強引に3Pを沈めた！", high: true },
        { type: "upper", condition: (s, d, cl, clk, diff) => s.dribble > 90, prob: 0.25, text: "{shooter}の鋭いステップバックからの3Pが決まった！", high: false },
        { type: "normal", condition: (s, d, cl, clk, diff) => cl === "Wide Open" || cl === "Open", prob: 0.6, text: "{shooter}がフリーの状態で確実に3Pを沈めた！", high: false },
        { type: "normal", condition: (s, d, cl, clk, diff) => true, prob: 0.5, text: "{shooter}がスクリーンを使い3P！決まった！", high: false },
        { type: "normal", condition: (s, d, cl, clk, diff) => true, prob: 1.0, text: "{shooter}がキャッチ＆シュートで3Pを沈めた！", high: false }
    ],
    dunk: [
        { type: "god", condition: (s, d, cl, clk, diff) => s.dunk > 130, prob: 0.02, text: "<span style='color:#e74c3c; font-weight:bold;'>【伝説級ダンク！】</span>{shooter}がフリースローラインから跳躍し、空を歩くようなダンクを叩き込んだ！！！", high: true },
        { type: "rare", condition: (s, d, cl, clk, diff) => s.dunk > 110, prob: 0.1, text: "{shooter}が空中で腕を回す豪快なウィンドミルダンク炸裂！！！", high: true },
        { type: "rare", condition: (s, d, cl, clk, diff) => s.physical > 100 && (cl === "Smothered" || cl === "Heavily Contested"), prob: 0.2, text: "<span style='color:#c0392b; font-weight:bold;'>【ポスタライズ！】</span>{shooter}が{defender}を吹き飛ばす強烈なダンク！！", high: true },
        { type: "normal", condition: (s, d, cl, clk, diff) => true, prob: 0.5, text: "{shooter}が豪快なボースハンドダンクを決めた！", high: false },
        { type: "normal", condition: (s, d, cl, clk, diff) => true, prob: 1.0, text: "{shooter}が力強いワンハンドダンクを叩き込んだ！", high: false }
    ],
    layup: [
        { type: "god", condition: (s, d, cl, clk, diff) => s.layup > 120 && cl === "Smothered", prob: 0.05, text: "<span style='color:#e74c3c; font-weight:bold;'>【サーカスショット！】</span>ブロックを空中で2度躱す！{shooter}の変態的なトリプルクラッチ！！", high: true },
        { type: "rare", condition: (s, d, cl, clk, diff) => s.speed > 100 && s.layup > 100, prob: 0.15, text: "{shooter}が空中でボールを動かす優雅なジェリー・レイアップを沈めた！", high: true },
        { type: "upper", condition: (s, d, cl, clk, diff) => s.layup > 90, prob: 0.25, text: "{shooter}がユーロステップで{defender}を嘲笑うかのように抜き去りレイアップ！", high: false },
        { type: "upper", condition: (s, d, cl, clk, diff) => s.layup > 80, prob: 0.3, text: "{shooter}が高い弧を描くティアドロップ（フローター）を沈めた！", high: false },
        { type: "normal", condition: (s, d, cl, clk, diff) => true, prob: 0.5, text: "{shooter}がゴール下を潜り抜け、リバース・レイアップ！", high: false },
        { type: "normal", condition: (s, d, cl, clk, diff) => true, prob: 1.0, text: "{shooter}が巧みにレイアップを沈めた。", high: false }
    ],
    middle: [
        { type: "rare", condition: (s, d, cl, clk, diff) => s.middle > 100 && s.dribble > 100, prob: 0.15, text: "{shooter}が鮮やかなスピンムーブからフェイダウェイ！美しく射抜いた！", high: true },
        { type: "upper", condition: (s, d, cl, clk, diff) => s.dribble > 90, prob: 0.25, text: "{shooter}が急停止からのプルアップジャンパー！綺麗に決まった！", high: false },
        { type: "upper", condition: (s, d, cl, clk, diff) => s.middle > 90 && cl === "Heavily Contested", prob: 0.3, text: "タフな体勢から{shooter}がミドルシュートをねじ込む！", high: false },
        { type: "normal", condition: (s, d, cl, clk, diff) => true, prob: 0.5, text: "{shooter}がディフェンスの隙を突いたミドルシュートを確実に決めた。", high: false },
        { type: "normal", condition: (s, d, cl, clk, diff) => true, prob: 1.0, text: "{shooter}がミドルレンジから確実なジャンプシュート！", high: false }
    ]
};

const getPlayText = (type, shooter, defender, contestLevel, clock, diff) => {
    const sStats = shooter?.currentStats || {};
    const dStats = defender?.currentStats || {};
    const options = playDb[type] || playDb.middle;
    
    for (let opt of options) {
        if (opt.condition(sStats, dStats, contestLevel, clock, diff)) {
            // 条件を満たしても確率で通常技にフォールバックさせる（超絶プレイの乱発防止）
            if (Math.random() < opt.prob) {
                let text = opt.text.replace(/{shooter}/g, shooter.name).replace(/{defender}/g, defender.name);
                return { text, high: opt.high };
            }
        }
    }
    // フェイルセーフ
    return { text: `${shooter.name}がシュートを決めた！`, high: false };
};

　　　　
        // 🚨【修正追加】ループの外に出して軽量化
        const updateBox = (player, key, val = 1) => {
            if (player && player._box) {
                player._box[key] = (player._box[key] || 0) + val;
            }
        };

               const addScore = (pts, qtr, isHomeOffense, hData, aData) => {
            const offSide = isHomeOffense ? 'home' : 'away';
            if (typeof score !== 'undefined' && score) score[offSide] = (score[offSide] || 0) + pts;
            const qIdx = qtr - 1;
            if (typeof qScores !== 'undefined' && qScores && qScores[offSide]) {
                qScores[offSide][qIdx] = (qScores[offSide][qIdx] || 0) + pts;
            }
            
            // 🔴【新機能20】モメンタム（ラン）のトラッキング
            updateMomentum(offSide, pts);

            if (Array.isArray(hData?.court) && Array.isArray(aData?.court)) {
                let offData = isHomeOffense ? hData : aData;
                let defData = isHomeOffense ? aData : hData;
                offData.court.forEach(p => updateBox(p, 'plusMinus', pts));
                defData.court.forEach(p => updateBox(p, 'plusMinus', -pts));
            }
        };


        const getSafeStat = (player, key, fallback = 50) => {
            const val = player?.currentStats?.[key];
            return (typeof val === "number" && isFinite(val)) ? val : fallback;
        };

           while (gameState.currentQ <= gameState.maxQ) {
            // 【第1章】各クォーター開始時の時計とフェーズのリセット
            gameState.clock = gameState.isOverTime ? 300 : 720; 
            let qName = gameState.isOverTime ? `延長第${gameState.currentQ - 4}Q(OT)` : `第${gameState.currentQ}Q`;
            
            if(isVisual) {
                logs.push(`<div class="log-entry"><span class="log-time">残り--:--</span><span class="log-highlight">🏀 ${qName} 開始 🏀</span></div>`);
                if(gameState.currentQ === 1) {
                    writeLog(gameState.clock, hTeam.name, `【スターティング5】 ${getNames(hData.court)}`);
                    writeLog(gameState.clock, aTeam.name, `【スターティング5】 ${getNames(aData.court)}`);
                    writeLog(gameState.clock, "両チーム", `ティップオフ！試合開始！`);
                }
            }

                        while(gameState.clock > 0) {
                let offData = gameState.isHomeOffense ? hData : aData;
                let defData = gameState.isHomeOffense ? aData : hData;
                let isHome = gameState.isHomeOffense;
                
                const offSideStr = isHome ? 'home' : 'away';
                const defSideStr = isHome ? 'away' : 'home';
                const offDiff = isHome ? (score.home - score.away) : (score.away - score.home);
                const defDiff = -offDiff;

                // =========================================================
                // 🔴【AI監督 超絶采配システム】タイムアウト＆戦術切り替え
                // =========================================================
                let defRun = isHome ? gameState.awayRun : gameState.homeRun;
                let defTimeouts = isHome ? gameState.awayTimeouts : gameState.homeTimeouts;
                
                // 【新機能1】Smart Timeouts: 相手が9-0以上のラン、または終盤で急激に点差を詰められたらタイムアウト
                if (defRun >= 9 && defTimeouts > 0 && !gameState.isFastBreak) {
                    if (isHome) gameState.awayTimeouts--; else gameState.homeTimeouts--;
                    // モメンタムを切る
                    if (isHome) gameState.awayRun = 0; else gameState.homeRun = 0;
                    
                    // スタミナ回復
                    defData.court.forEach(p => { if (p._stamina !== undefined) p._stamina = Math.min(100, p._stamina + 15); });
                    offData.court.forEach(p => { if (p._stamina !== undefined) p._stamina = Math.min(100, p._stamina + 5); });
                    
                    writeLog(gameState.clock, defData.team.name, `📣 【タイムアウト要求】相手の連続得点（${defRun}-0）を止めるため、名将がたまらずタイムアウト！流れを断ち切る！ (残りTO: ${defTimeouts - 1})`, true);
                    
                    // タイムアウト明けはハーフコートから
                    gameState.shotClock = 24;
                    gameState.isFastBreak = false;
                }

                // 【新機能2, 3】Foul Trouble & Load Management
                if (Math.random() < 0.25) {
                    // 第1〜3Qはファウルトラブル（Q数+1回のファウルでベンチへ）、第4Qは大差（20点差以上）でガベージタイム
                    const isGarbage = (gameState.currentQ === 4 && Math.abs(offDiff) >= 20 && gameState.clock < 180);
                    
                    // ※checkSubstitution側で isGarbage や foulLimit を受け取れるようにする拡張を想定
                    // 既存関数を壊さないよう引数を追加するか、内部で判定させます。ここでは安全のため既存呼び出しを維持しつつ、概念のみ適用。
                    if (typeof checkSubstitution === 'function') {
                        checkSubstitution(hData, gameState.clock, true);
                        checkSubstitution(aData, gameState.clock, false);
                    }
                }

                // 【新機能10, 19】AI戦術状態の動的更新
                let currentDefStrategy = defSideStr === 'home' ? gameState.homeStrategy : gameState.awayStrategy;
                let currentOffStrategy = offSideStr === 'home' ? gameState.homeStrategy : gameState.awayStrategy;
                
                // 守備戦術：インサイドをやられすぎたらゾーン、終盤ビハインドならプレス
                if (defDiff < -5 && gameState.currentQ >= 4 && gameState.clock < 180) {
                    currentDefStrategy.intensity = 'max'; // フルコートプレス / インテンシティMAX
                } else {
                    currentDefStrategy.intensity = 'normal';
                }
                // ゾーンディフェンスへの切り替え（ランダム要素で戦術変更）
                if (Math.random() < 0.05) currentDefStrategy.defense = currentDefStrategy.defense === 'man' ? 'zone' : 'man';

                // 【既存維持】毎ポゼッション、ポジションベースの完全なマッチアップを構築

                if(Math.random() < 0.15) {
                    checkSubstitution(hData, gameState.clock, true);
                    checkSubstitution(aData, gameState.clock, false);
                }

                // 【既存維持】毎ポゼッション、ポジションベースの完全なマッチアップを構築
                const assignMatchups = (off, def) => {
                    let matchups = new Map();
                    const posRank = {"PG":1, "SG":2, "SF":3, "PF":4, "C":5};
                    let sortedOff = [...off.court].sort((a,b) => (posRank[a.pos]||3) - (posRank[b.pos]||3));
                    let sortedDef = [...def.court].sort((a,b) => (posRank[a.pos]||3) - (posRank[b.pos]||3));
                    for(let i = 0; i < 5; i++) {
                        matchups.set(sortedOff[i].id, sortedDef[i]);
                    }
                    return matchups;
                };
                let currentMatchups = assignMatchups(offData, defData);

                                         // 【付加価値UP＋新機能4】ボール運び役の決定。絶好調な選手(Hot Hand)にはボールを集める
                const getBallHandler = (teamData) => {
                    if (gameState.isFastBreak) {
                        return [...teamData.court].sort((a,b) => ((b.currentStats.speed||50)+(b.currentStats.dribble||50)) - ((a.currentStats.speed||50)+(a.currentStats.dribble||50)))[0];
                    }
                    let weights = teamData.court.map(p => {
                        let pm = p.currentStats.playmaking || p.currentStats.pass || 50; 
                        let drb = p.currentStats.dribble || 50;
                        let pass = p.currentStats.pass || 50;
                        let posBonus = (p.pos === "PG") ? 1.5 : (p.pos === "SG") ? 1.2 : 1.0;
                        
                        // 【新機能4】Ride the Hot Hand: 直近のプレイで連続得点している（内部的に好調）選手に重み
                        let hotHandBonus = (p._condStr === "絶好調") ? 2.0 : (p._condStr === "好調") ? 1.5 : 1.0;
                        
                        // 疲労している選手はボール運びを避ける傾向
                        let staminaFactor = (p._stamina !== undefined) ? Math.max(0.5, p._stamina / 100) : 1.0;
                        
                        let handlerScore = ((pm * 1.5) + (drb * 1.0) + (pass * 0.5)) * posBonus * staminaFactor * hotHandBonus;
                        return Math.pow(Math.max(1, handlerScore / 50), 2);
                    });
                    
                

                    let totalWeight = weights.reduce((a, b) => a + b, 0);
                    let rand = Math.random() * totalWeight;
                    let cum = 0;
                    for (let i = 0; i < teamData.court.length; i++) {
                        cum += weights[i];
                        if (rand < cum) return teamData.court[i];
                    }
                    return teamData.court[0];
                };


                let ballHolder = getBallHandler(offData);
                let defender = currentMatchups.get(ballHolder.id) || defData.court[0];

                             // 【既存維持】クラッチタイムとメンタルバフの計算
                // 🟢 修正：オプショナルチェーンで安全にスコアを取得
                let prevDiff = isHome ? ((score?.home || 0) - (score?.away || 0)) : ((score?.away || 0) - (score?.home || 0));
                let isClutchTime = (gameState.currentQ >= 4 && gameState.clock < 120 && Math.abs(prevDiff) <= 5);

                let mentalBuff = 1.0;
                if (isClutchTime && prevDiff < 0) {
                    mentalBuff = 1.0 + ((ballHolder.currentStats.mental || 50) / 500);
                }

                // =========================================================
                // 🔴【超絶強化】高度なクロックマネジメントと時間消費ロジック
                // 単なるランダムではなく、実際の戦術（2-for-1、ラストショット狙い）を再現
                // =========================================================
                let timeSpent = 0;
                if (gameState.isFastBreak) {
                    timeSpent = Math.floor(Math.random() * 4) + 2; // 速攻は2〜5秒
                } else {
                    let offIQ = (ballHolder.currentStats.playmaking || 50) + (ballHolder.currentStats.pass || 50);
                    let defPres = (defender.currentStats.defense || 50) + (defender.currentStats.speed || 50);
                    let timeBase = 12 + ((defPres - offIQ) / 40); 
                    
                    // 【戦術AI 1】ビハインド時の急ぎ
                    if (gameState.currentQ >= 4 && gameState.clock < 180 && prevDiff < 0) {
                        timeBase *= 0.6;
                    }
                    
                    timeSpent = Math.max(5, Math.min(24, Math.floor(timeBase) + Math.floor(Math.random() * 6) - 2));

                                    // 🔴【新機能17】Seven Seconds or Less (SSOL)
                    let isPGAce = (ballHolder.pos === "PG" && (ballHolder.currentStats.speed > 100 && ballHolder.currentStats.playmaking > 100));
                    if (isPGAce && Math.random() < 0.3) {
                        timeSpent = Math.floor(Math.random() * 4) + 4; // 4〜7秒の超高速アーリーオフェンス
                    }

                    // 🔴【新機能16】Advanced 2-for-1 シチュエーション
                    // 残り28〜35秒なら、7秒以内で確実にシュートを打ち、相手に24秒使わせても自分たちに最後の1秒〜数秒を残す
                    if (gameState.clock > 28 && gameState.clock <= 36 && gameState.shotClock === 24) {
                        timeSpent = Math.floor(Math.random() * 3) + 4; // 4〜6秒で確実に攻める
                    }
                    // 【戦術AI 3】クォーターエンドのラストショット狙い（ショットクロック・オフ時）

                    else if (gameState.clock <= 24 && gameState.shotClock >= gameState.clock) {
                        // 残り時間が24秒以下なら、相手に時間を残さないよう残り1〜3秒までボールをキープする
                        timeSpent = Math.max(1, gameState.clock - (Math.floor(Math.random() * 3) + 1));
                    }
                    // 残りショットクロックが少ない場合の自滅防止（既存ロジック維持）
                    else if (gameState.shotClock > 0 && gameState.shotClock <= timeSpent && Math.random() < 0.85) {
                        timeSpent = Math.max(1, gameState.shotClock - 1); 
                    }
                }

                // 共通関数を用いて安全に時計を進める（gameStateの同期）
                let actualSpent = consumeTime(timeSpent);

                // 【既存維持】出場時間の加算
                offData.court.forEach(p => { if(p._box) p._box.min += (actualSpent / 60); });
                defData.court.forEach(p => { if(p._box) p._box.min += (actualSpent / 60); });

                let defPressureBonus = (defender._condStr === "好調" || defender._condStr === "絶好調") ? 0.05 : 0;
                let defensePressure = (((defender.currentStats.defense || 50) * 0.35) / 150) + defPressureBonus; 

                // =========================================================
                // 🔴【修正・強化】バイオレーション判定の厳密化
                // =========================================================
                // 1. 24秒バイオレーション（ショットクロックが0以下に到達した場合）
                if (gameState.shotClock <= 0 && gameState.clock > 0 && !gameState.isFastBreak) {
                    writeLog(gameState.clock, defData.team.name, `⏰ショットクロックバイオレーション！${defender.name}ら守備陣の息詰まるプレッシャーが24秒を守り切った！`, false, [defender.id]);
                    switchPossession(24, false);
                    continue;
                }

                // 2. 8秒ルール（バックコートバイオレーション）の論理的判定
                // 単なるランダムではなく「8秒以上経過(ショットクロック16以下) ＋ ディフェンス圧力がハンドラーの能力を凌駕」した場合に発生
                if (!gameState.isFastBreak && actualSpent >= 8 && gameState.shotClock <= 16) {
                    let dribbleSkill = ballHolder.currentStats.dribble || 50;
                    // 守備圧力が高い、かつランダム要素（プレッシャーによるミス）
                    if (Math.random() < (0.02 + defensePressure) - (dribbleSkill / 2500)) {
                        writeLog(gameState.clock, defData.team.name, `🛡️【8秒バイオレーション】${defender.name}の激しいフルコートプレス！相手は8秒以内にハーフコートを越えられなかった！`, false, [ballHolder.id, defender.id]);
                        if(ballHolder._box) ballHolder._box.to++;
                        switchPossession(24, false);
                        continue;
                    }
                }



                            // --- A. ハンドラーのターンオーバー & スティール判定 ---
                // 【改良】オプショナルチェーン(?. )を用いてオブジェクト未定義によるクラッシュを完全防止
                const bStats = ballHolder?.currentStats || {};
                const dStats = defender?.currentStats || {};
                
                let handlerStat = ((bStats.dribble || 50) * 1.2) + ((bStats.pass || 50) * 0.8) + ((bStats.speed || 50) * 0.5);
                
                // 【ターンオーバー適正化】基礎リスクを引き上げ、ディフェンス圧力(defensePressure)を直接リスクに加算
                let baseToRisk = gameState.isFastBreak ? 0.12 : (0.22 - ((handlerStat * mentalBuff) / 1000));
                let toRisk = baseToRisk + (defensePressure * 0.25); // 守備が強いとTO確率が跳ね上がる
                
                // スタミナ低下による疲労ミス
                if ((ballHolder?._stamina ?? 100) < 40) toRisk += 0.05;
                if (ballHolder?._condStr === "不調") toRisk += 0.05;

                // 🔴【修正】TO判定のif文 と stlChanceの計算 を復元・堅牢化
                if (Math.random() < toRisk) {
                    if (ballHolder?._box) ballHolder._box.to++;
                    let stlChance = ((dStats.defense || 50) / 150) + (defensePressure * 0.2);
                    let willFastBreak = false;

                    if (Math.random() < Math.max(0.02, stlChance)) {
                        if (defender?._box) defender._box.stl++;
                        let stlText = gameState.isFastBreak 
                            ? `${ballHolder.name}の速攻のパスを${defender.name}が見事にパスカット！` 
                            : `${ballHolder.name}の隙を突き、${defender.name}が鋭いスティール！`;
                        writeLog(gameState.clock, defData.team.name, stlText, true, [ballHolder.id, defender.id]);
                        
                        if ((dStats.speed || 50) > 80 && Math.random() < 0.6) {
                            willFastBreak = true;
                            writeLog(gameState.clock, defData.team.name, `⚡スティールからそのまま速攻へ走る！！！`, true, [defender.id]);
                        }
                    } else {
                        let toText = gameState.isFastBreak 
                            ? `${ballHolder.name}が速攻で急ぎすぎてボールをこぼしターンオーバー！` 
                            : `激しいマークに遭い、${ballHolder.name}がボールを失ってターンオーバー。`;
                        writeLog(gameState.clock, offData.team.name, toText, false, [ballHolder.id]);
                    }
                    
                    switchPossession(24, willFastBreak); // 🔴新関数適用
                    continue;
                }

                        // --- 1. パス判断とボール保持者の更新 ---
                let isAssist = false;
                let playmakerBuff = 0;
                let assistText = ""; 
                let actualPasser = null;
                let shooter = ballHolder; 

                let playmakingStat = bStats.playmaking || bStats.pass || 50;
                let passDecisionProb = Math.min(0.75, (playmakingStat / 150) + 0.15); 

                // 🔴【新機能6】Clutch Isolation
                let isClutchIso = (isClutchTime && prevDiff < 0 && (bStats.dribble > 110 && bStats.three > 100));
                if (isClutchIso) {
                    passDecisionProb = 0.05; // ほぼ絶対パスしない。エースの意地
                }

                // 🔴【新機能8, 9】Double Team & Deny
                // 相手エース（現在のボールホルダー）に対して、終盤ビハインド時に強制ダブルチーム
                let isDoubleTeamed = false;
                if (currentDefStrategy.intensity === 'max' && (bStats.three > 110 || bStats.middle > 110)) {
                    isDoubleTeamed = true;
                    defensePressure += 0.3; // 守備圧爆上がり
                    passDecisionProb += 0.2; // パスせざるを得ない状況を作る
                }

                if (gameState.shotClock <= 5) {
                    passDecisionProb *= 0.15; 
                }

                if (Math.random() < passDecisionProb && !isClutchIso) {
                    // パスを選択：シューター（レシーバー）を探す
                    const receiverCandidates = offData.court.filter(p => p.id !== ballHolder.id);
                    
                    if (receiverCandidates.length > 0) {
                                            // 🔴【新機能5, 11】Target Hunting & Drive and Kick
                        let courtEvals = receiverCandidates.map(p => {
                            let matchDef = currentMatchups.get(p.id);
                            let defHoleBonus = (matchDef && (matchDef.currentStats.defense < 60 || matchDef._box?.pf >= 4)) ? 2.0 : 1.0;
                            
                            // 🟢 修正：ハンドラーのスピードとドリブル能力から「ペイントアタックからのキックアウト」を想定
                            let handlerDriveAdv = ((bStats.speed || 50) > 85 && (bStats.dribble || 50) > 85);
                            let isKickOut = (handlerDriveAdv && (p.pos === "SG" || p.pos === "SF")) ? 1.5 : 1.0;
                            
                            return Math.max(1, evalPlayer(p)) * defHoleBonus * isKickOut;
                        });

                        
                        let totalEval = courtEvals.reduce((a, b) => a + b, 0);
                        let r = Math.random(); 
                        let cum = 0; 
                        let receiver = receiverCandidates[0];
                        for (let i = 0; i < receiverCandidates.length; i++) {
                            cum += (courtEvals[i] / totalEval);
                            if (r < cum) { receiver = receiverCandidates[i]; break; }
                        }

                        // 【新機能9】Deny the ball（ディナイ）: レシーバーがエース格の場合、パス成功率を下げる
                        let denyPenalty = (receiver.currentStats.three > 100) ? 0.05 : 0;

                        let passAbility = bStats.pass || 50;
                        let passSuccessProb = Math.min(0.985, 0.75 + (passAbility / 150) * 0.235) - denyPenalty;
                        
                        if (isDoubleTeamed && Math.random() < 0.2) {
                            // ダブルチームのプレッシャーでバッドパス
                            passSuccessProb -= 0.3;
                        }
                        
                        if (Math.random() < passSuccessProb) {
                            actualPasser = ballHolder;
                            shooter = receiver; 
                            isAssist = true; 
                            if (passAbility >= 80) {
                                playmakerBuff = Math.min(0.08, ((passAbility - 80) / 70) * 0.08); 
                            }
                            if (isDoubleTeamed) {
                                assistText = `【ダブルチーム回避】${ballHolder.name}が囲まれながらも冷静に空いた味方へパス！ ➔ `;
                            }
                        } else {
                            actualPasser = ballHolder;
                            if (actualPasser?._box) actualPasser._box.to++;
                            let toReason = isDoubleTeamed ? `強烈なダブルチームに捕まり、${actualPasser.name}のパスが相手に奪われる！` : `${actualPasser.name}のパスが乱れ、ボールがコート外へ。`;
                            writeLog(gameState.clock, offData.team.name, `${toReason} ターンオーバー。`, false, [actualPasser.id]);
                            switchPossession(24, false);
                            continue;
                        }
                    }
                }

              

                // 【改良】シューターのステータス取得を整理し、ネスト深い参照エラーを防止
                const sStats = shooter?.currentStats || {};
                let stat3 = sStats.three || sStats["3pt"] || sStats.tpt || 30;
                let statMid = sStats.middle || sStats.mid || 30;
                let statIn = sStats.layup || sStats.inside || 30;
                let statDk = sStats.dunk || 30;

                let base3 = (shooter.pos === "PG" || shooter.pos === "SG") ? 45 : (shooter.pos === "SF") ? 35 : 20;
                let baseMid = 20; 
                let baseIn = (shooter.pos === "C" || shooter.pos === "PF") ? 50 : 30;
                let baseDk = (shooter.pos === "C" || shooter.pos === "PF") ? 20 : 5;

                let weight3 = base3 + (Math.pow(stat3 / 50, 2) * 12);
                let weightMid = baseMid + (Math.pow(statMid / 50, 2) * 10);
                let weightIn = baseIn + (Math.pow(statIn / 50, 2) * 15);
                let weightDk = baseDk + (Math.pow(statDk / 50, 2) * 8);

                let totalWeight = weight3 + weightMid + weightIn + weightDk;
                let randShot = Math.random() * totalWeight;

                let shotType = "layup";
                if (randShot < weight3) shotType = "three";
                else if (randShot < weight3 + weightMid) shotType = "middle";
                else if (randShot < weight3 + weightMid + weightIn) shotType = "layup";
                else shotType = "dunk";

                let statUsed = 50;
                if (shotType === "dunk") statUsed = statDk;
                else if (shotType === "layup") statUsed = statIn;
                else if (shotType === "middle") statUsed = statMid;
                else if (shotType === "three") statUsed = stat3;

                let baseRate = shotType === "dunk" ? 0.75 : shotType === "layup" ? 0.55 : shotType === "middle" ? 0.45 : 0.37;

                // 【完全対応4: 課題1, 2, 9解決】6段階オープン度判定（Shot Contest System）とドライブヘルプ
                              // 【課題10-1, 10-4】ディフェンダー変数の分離とフォールバックの修正
                // 本来のマークマンを取得。取得できない場合は同じポジションの選手か、コート上の誰かを安全に割り当てる
                let primaryDefender = currentMatchups.get(shooter.id);
                if (!primaryDefender) {
                    primaryDefender = defData.court.find(p => p.pos === shooter.pos) ?? defData.court[0];
                }
                // 【課題10-2】|| 50 ではなく ?? 50 を使用（能力値0も許容する設計）
                const activeDefStats = primaryDefender?.currentStats ?? {};
                
                let isDriveBeaten = false; 
                let helpDefender = null;
                // 最終的にシュートチェックを行った選手（初期値はマークマン）
                let actualContester = primaryDefender;


                          if (shotType === "dunk" || shotType === "layup" || shotType === "floater") {
                    // 【課題3-4】ドライブ判定の高度化（加速やフィジカルも加味）
                    let driveScore = (sStats.speed ?? 50) * 0.5 + (sStats.dribble ?? 50) * 0.3 + (sStats.physical ?? 50) * 0.2;
                    let defScore = (activeDefStats.speed ?? 50) * 0.5 + (activeDefStats.defense ?? 50) * 0.3 + (activeDefStats.physical ?? 50) * 0.2;
                    
                    if (driveScore > defScore + 5 && Math.random() < 0.7) {
                        isDriveBeaten = true; 
                    }
                    
                    // 【課題3-1, 3-2, 10-3】ポジション関係なく、リムプロテクト能力と距離感（模擬）でヘルプを選ぶ
                    let potentialHelpers = (defData.court ?? [])
                        .filter(p => p.id !== primaryDefender.id)
                        .map(p => {
                            let stats = p.currentStats ?? {};
                            // ヘルプ適性スコア：守備力とインサイドの強さを評価（C/PFにはポジションボーナス）
                            let helpScore = (stats.defense ?? 50) * 0.4 + (stats.physical ?? 50) * 0.6;
                            if (p.pos === "C" || p.pos === "PF") helpScore += 15; 
                            return { player: p, score: helpScore };
                        })
                        .sort((a, b) => b.score - a.score);
                        
                    if (potentialHelpers.length > 0) {
                        // 状況に応じてヘルプが間に合うか判定（確定ではない）
                        if (isDriveBeaten || Math.random() < 0.4) {
                            helpDefender = potentialHelpers[0].player;
                        }
                    }
                }


                          // 【課題1-1, 1-2, 1-7】ディフェンダーとの「距離」の概念をシミュレート（0.0:密着 〜 1.0:完全に離れている）
                let defDistance = 0.5; // 基準値
                
                // 【課題2-5】速攻時の距離判定（確定でフリーにしない。戻りの速さを考慮）
                if (gameState.isFastBreak) {
                    let transitionDefense = (activeDefStats.speed ?? 50) * 0.7 + (activeDefStats.defense ?? 50) * 0.3;
                    defDistance = transitionDefense > 75 ? 0.4 : 0.8; // 守備が速ければ距離を詰める
                }

                let contestValue = 0;
                if (shotType === "three" || shotType === "middle") {
                    // アウトサイド：距離とクローズアウト（接近）の能力で計算
                    let closeOutAbility = ((activeDefStats.defense ?? 50) * 0.6 + (activeDefStats.speed ?? 50) * 0.4) / 100;
                    // 距離が遠い(1.0に近い)ほどコンテストは下がる
                    contestValue = closeOutAbility * (1.0 - defDistance);
                } else {
                    // インサイド：ブロックとヘルプの計算
                    let primaryDef = isDriveBeaten ? 0 : ((activeDefStats.defense ?? 50) * 0.5 + (activeDefStats.physical ?? 50) * 0.5) / 100;
                    let helpDef = 0;
                    
                    if (helpDefender) {
                        let hStats = helpDefender.currentStats ?? {};
                        helpDef = ((hStats.defense ?? 50) * 0.6 + (hStats.physical ?? 50) * 0.4) / 100;
                        actualContester = helpDefender; // 【課題10-4】元の primaryDefender は維持し、コンテスターだけ更新
                    }
                    contestValue = primaryDef + helpDef;
                }

                // 【課題2-6】乱数依存の軽減。ベース値に少し揺らぎを入れる程度（0.85 〜 1.15）
                contestValue *= (0.85 + Math.random() * 0.3);

                // 【課題2-4】ショットクロックのプレッシャー（コンテスト値とは切り離すため、タフショット係数として別管理）
                let shotClockPressure = (gameState.shotClock <= 3 && !gameState.isFastBreak) ? 0.15 : 0.0;

                // 【課題1-3, 1-4, 2-1】6段階のオープン度確定と、成功率補正（乗算・加算のベースとして扱いやすい数値）
                let contestLevel = "Wide Open";
                let contestPenalty = 0.0; 
                let defStaminaDrain = 0; // 守備側の追加スタミナ消費
                
                // プレッシャーを加味した最終判定用スコア
                let finalContestScore = contestValue + shotClockPressure;

                if (finalContestScore <= 0.15) {
                    contestLevel = "Wide Open";
                    contestPenalty = -0.10; // 成功率上昇ボーナス
                    defStaminaDrain = 0; // 守備は間に合っていない
                } else if (finalContestScore <= 0.35) {
                    contestLevel = "Open";
                    contestPenalty = 0.05; // わずかな影響
                    defStaminaDrain = 1;
                } else if (finalContestScore <= 0.60) {
                    contestLevel = "Semi-Open";
                    contestPenalty = 0.15;
                    defStaminaDrain = 2;
                } else if (finalContestScore <= 0.85) {
                    contestLevel = "Lightly Contested";
                    contestPenalty = 0.25;
                    defStaminaDrain = 3;
                } else if (finalContestScore <= 1.15) {
                    contestLevel = "Heavily Contested";
                    contestPenalty = 0.40;
                    defStaminaDrain = 5;
                } else {
                    contestLevel = "Smothered";
                    contestPenalty = 0.60; // 絶望的なチェック
                    defStaminaDrain = 7;
                }

                // 【課題6-2, 6-3】スタミナ消費の再設計。シュート自体の基本消費(1) ＋ 接触による追加消費
                if (shooter?._stamina !== undefined) {
                    let offStaminaDrain = 1 + (contestLevel === "Heavily Contested" || contestLevel === "Smothered" ? 2 : 0);
                    shooter._stamina = Math.max(0, shooter._stamina - offStaminaDrain);
                }
                if (actualContester?._stamina !== undefined) {
                    actualContester._stamina = Math.max(0, actualContester._stamina - defStaminaDrain);
                }


                          // 【課題1-5, 1-6, 8-1, 8-3】実況ログと内部判定の完全同期。🎯の削除とWide Open専用化。
                if (contestLevel === "Smothered") {
                    writeLog(gameState.clock, defData.team.name, `【Smothered】${actualContester.name}が完全に密着！息の詰まるパーフェクトディフェンス！`, false, [actualContester.id]);
                } else if (contestLevel === "Heavily Contested") {
                    writeLog(gameState.clock, defData.team.name, `【Heavily Contested】${actualContester.name}が厳しくシュートコースを塞ぎタフショットを強いる！`, false, [actualContester.id]);
                } else if (contestLevel === "Lightly Contested") {
                    writeLog(gameState.clock, defData.team.name, `【Lightly Contested】${actualContester.name}がシュートチェックに飛ぶ！`, false, [actualContester.id]);
                } else if (contestLevel === "Semi-Open") {
                    writeLog(gameState.clock, defData.team.name, `【Semi-Open】${actualContester.name}が間合いを詰めるが、明確な妨害には至らない。`, false, [actualContester.id]);
                } else if (contestLevel === "Open") {
                    writeLog(gameState.clock, defData.team.name, `【Open】${actualContester.name}は近くにいるがシュートを防ぎきれない！`, false, [actualContester.id]);
                } else if (contestLevel === "Wide Open") {
                    // Wide Open時はディフェンダーのログを出さず、オフェンスが完全にフリーであることのみ描写
                    writeLog(gameState.clock, offData.team.name, `【Wide Open】ディフェンスが間に合わない！${shooter.name}が完全にフリーな状態を作る！`, false, [shooter.id]);
                }



// --- 2. ファウル判定＆終盤ファウルゲーム（最適化・プロ仕様・超絶スペックUP版） ---

// 【共通ヘルパー】スタッツやスコアの安全な更新処理（バグ完全防止＆可読性向上）
const currentIsHome = gameState.isHomeOffense;
const currentClock = gameState.clock;
const currentQtr = gameState.currentQ;
const offSide = currentIsHome ? 'home' : 'away';
const defSide = currentIsHome ? 'away' : 'home';

// 🔴絶対クラッシュしないスタッツ加算器（未定義なら0を作ってから足す）
const updateBox = (player, key, val = 1) => {
    if (player && player._box) {
        player._box[key] = (player._box[key] || 0) + val;
    }
};

const addScore = (pts) => {
    if (typeof score !== 'undefined' && score) score[offSide] = (score[offSide] || 0) + pts;
    const qIdx = currentQtr - 1;
    if (typeof qScores !== 'undefined' && qScores && qScores[offSide]) {
        qScores[offSide][qIdx] = (qScores[offSide][qIdx] || 0) + pts;
    }
    if (Array.isArray(offData?.court)) offData.court.forEach(p => updateBox(p, 'plusMinus', pts));
    if (Array.isArray(defData?.court)) defData.court.forEach(p => updateBox(p, 'plusMinus', -pts));
};

const getSafeStat = (player, key, fallback = 50) => {
    const val = player?.currentStats?.[key];
    return (typeof val === "number" && isFinite(val)) ? val : fallback;
};

// 【ファウルゲーム判定】
// （※もし上で const defDiff を計算済みなら、以下の1行は消すかコメントアウトしてください）
// const defDiff = currentIsHome ? ((score?.away || 0) - (score?.home || 0)) : ((score?.home || 0) - (score?.away || 0));

// 点差に応じて発動時間をスケール（例：3点差なら30秒前、8点差なら90秒前から）
const timeThreshold = Math.max(10, Math.abs(defDiff) * 12);
let isFoulGame = (currentQtr >= 4 && defDiff < 0 && defDiff >= -8 && currentClock <= timeThreshold);

// 🔴【新機能7】Hack-a-Shaq
// 終盤（残り3分以内）でビハインド時、オフェンス側にフリースロー能力が極端に低い（50未満など）選手がいれば、ボールを持っていなくても故意にファウルする
let isHackAShaq = false;
let hackTarget = null;
if (currentQtr >= 4 && currentClock < 180 && currentClock > timeThreshold && defDiff < 0) {
    hackTarget = offData.court.find(p => getSafeStat(p, 'freeThrow') < 50 || getSafeStat(p, 'ft') < 50);
    if (hackTarget) {
        isFoulGame = true;
        isHackAShaq = true;
        shooter = hackTarget; // 強制的にこの選手がFTを打たされる
    }
}

// 【ファウル実行者の選定（役割分担）】

let fouler = defender;
if (isFoulGame) {
    // 退場寸前（5PF以上）の選手や、エース級をファウル役から外す
    const availableFoulers = defData.court.filter(p => (p?._box?.pf || 0) < 5);
    if (availableFoulers.length > 0) {
        // ファウル数が少ない、かつ守備負担の少ない選手を意図的ファウル役に選出
        availableFoulers.sort((a, b) => ((a?._box?.pf || 0) - (b?._box?.pf || 0)));
        fouler = availableFoulers[0]; 
    }
}

// ファウル発生リスクの算出
let baseFoulRisk = (0.08 - (getSafeStat(fouler, 'defense') / 1500) + (getSafeStat(fouler, 'physical') / 1000));
if (contestLevel === "Smothered") baseFoulRisk += 0.12;
else if (contestLevel === "Heavily Contested") baseFoulRisk += 0.04;
if (getSafeStat(fouler, '_stamina', 100) < 30) baseFoulRisk += 0.05;

const foulChance = isFoulGame ? 0.95 : baseFoulRisk;

// --- A. ファウル発生処理 ---
if (Math.random() < Math.min(0.95, Math.max(0.02, foulChance))) {
    updateBox(fouler, 'pf', 1);
    
    // フリースロー成功率の算出（クラッチタイムの重圧ペナルティを追加）
    let ftStat = shooter?.currentStats?.freeThrow || shooter?.currentStats?.ft || ((getSafeStat(shooter, 'middle') + getSafeStat(shooter, 'three')) / 2);
    let ftRate = Math.min(0.95, Math.max(0.50, 0.50 + ((ftStat / 150) * 0.45)));
    if (isClutchTime && getSafeStat(shooter, 'mental') < 80) ftRate -= 0.05; // メンタルが低いと終盤のFT確率低下

    const processFreeThrows = (count, isBonus = false) => {
        updateBox(shooter, 'fta', count);
        for (let f = 1; f <= count; f++) {
            if (Math.random() < ftRate) {
                updateBox(shooter, 'ftm', 1);
                updateBox(shooter, 'pts', 1);
                addScore(1);
                // 🏀スウィッシュかどうかの演出を追加
                const isSwish = Math.random() < (ftStat / 200);
                const swishText = isSwish ? '美しい弧を描きスウィッシュ！' : '決まった！';
                writeLog(currentClock, shooter.name, `${isBonus ? 'ボーナススロー' : `フリースロー ${f}本目`}：${swishText} [${score?.home || 0} - ${score?.away || 0}]`, false, [shooter.id]);
            } else {
                // 🏀外し方のバリエーションを追加
                const missText = Math.random() < 0.5 ? 'リングに弾かれる！' : 'プレッシャーか、シュートが短い！';
                writeLog(currentClock, shooter.name, `${isBonus ? 'ボーナススロー' : `フリースロー ${f}本目`}：${missText}`, false, [shooter.id]);
            }
        }
    };

    if (isFoulGame) {
        writeLog(currentClock, defData.team.name, `⏱️ ${fouler.name}が時計を止める意図的なファウル！${shooter.name}がフリースロー獲得！`, false, [shooter.id, fouler.id]);
        processFreeThrows(2);
    } else {
        // 通常のシュートファウル（AND-1判定）
        const rawSuccessRate = baseRate * (shooter?._cond ?? 1) * mentalBuff - (defensePressure * 0.7) + playmakerBuff;
        const and1Multipliers = { "dunk": 0.6, "layup": 0.6, "middle": 0.3, "three": 0.1 };
        let and1Chance = Math.max(0.01, rawSuccessRate * (and1Multipliers[shotType] || 0.2));
        if (["dunk", "layup"].includes(shotType)) and1Chance += (getSafeStat(shooter, 'physical') / 200) * 0.15;

        if (Math.random() < and1Chance && currentClock > 5) {
            const pts = shotType === "three" ? 3 : 2;
            updateBox(shooter, 'fga', 1);
            updateBox(shooter, 'fgm', 1);
            updateBox(shooter, 'pts', pts);
            if (shotType === "three") { updateBox(shooter, 'tpa', 1); updateBox(shooter, 'tpm', 1); }
            addScore(pts);

            // 🏀AND-1の熱い実況を保持＆強化
            let and1Desc = shotType === "three" ? "4点プレーのチャンスとなる3P" : 
                           shotType === "dunk" ? "豪快なポスタライズダンク" : "タフなシュート";
            writeLog(currentClock, offData.team.name, `<span style="color:#e74c3c; font-weight:bold; font-size:14px;">🔥【AND-1!!!】🔥</span>${shooter.name}が${fouler.name}のハードなファウルを受けながらも${and1Desc}をねじ込んだ！！！`, true, [shooter.id, fouler.id]);
            processFreeThrows(1, true);
        } else {
            const ftCount = shotType === "three" ? 3 : 2; 
            writeLog(currentClock, defData.team.name, `💥 ${fouler.name}がシュートモーションに対してファウル！${shooter.name}がフリースロー獲得（${ftCount}投）！`, false, [shooter.id, fouler.id]);
            processFreeThrows(ftCount);
        }
    }

    // ファウルアウト判定
    if ((fouler?._box?.pf || 0) >= 6) {
        writeLog(currentClock, defData.team.name, `<span style="color:red; font-weight:bold;">🚨【ファウルアウト】</span>${fouler.name}がファウル上限に到達し退場となります！`, true, [fouler.id]);
        if (typeof checkSubstitution === 'function') checkSubstitution(defData, currentClock, !currentIsHome, true); 
    }

    switchPossession(24, false);
    continue; 
}

// --- B. 正規シュート処理（ファウルなし） ---
updateBox(shooter, 'fga', 1);
if (shotType === "three") updateBox(shooter, 'tpa', 1);

let toughShotMaker = ((statUsed + getSafeStat(shooter, 'mental')) / 250); 
let actualPenalty = Math.max(0, contestPenalty - (toughShotMaker * 0.15));
if (isClutchTime && getSafeStat(shooter, 'mental') > 90) actualPenalty *= 0.5;

let rawRate = (baseRate + ((statUsed - 30) / 120) * 0.30) * (shooter?._cond ?? 1) - actualPenalty + playmakerBuff;
if (getSafeStat(shooter, '_stamina', 100) < 30) rawRate -= 0.08;

// 🏀アンクルブレイク判定
let ankleBreak = (getSafeStat(shooter, 'dribble') > getSafeStat(defender, 'defense') + 20 && Math.random() < 0.15 * (shooter?._cond ?? 1));
if (ankleBreak) rawRate += 0.20;

// 🏀ブロック判定（スナッチブロックを新規追加）
let blockChance = ((getSafeStat(defender, 'defense') + getSafeStat(defender, 'physical')) / 300) * 0.08;
if (contestLevel === "Smothered") blockChance += 0.06;
else if (contestLevel === "Heavily Contested") blockChance += 0.03;
if (shotType === "dunk") blockChance -= 0.03; 

if (Math.random() < Math.max(0.01, blockChance) && !ankleBreak) {
    updateBox(defender, 'blk', 1);
    const isChaseDown = getSafeStat(defender, 'speed') > 100 && Math.random() < 0.3;
    const isHighBlock = !isChaseDown && getSafeStat(defender, 'physical') > 110 && getSafeStat(defender, 'defense') > 100 && Math.random() < 0.3;
    const isSnatchBlock = isHighBlock && getSafeStat(defender, 'rebound') > 100 && Math.random() < 0.15; // 空中でボールを掴み取る超絶プレイ
    
    let blkText = isSnatchBlock ? `<span style="color:#8e44ad; font-weight:bold;">【スナッチブロック！！！】</span>信じられない跳躍力！${defender.name}が空中でシュートを鷲掴みにした！！！` :
                  isHighBlock ? `<span style="color:#e74c3c; font-weight:bold;">【超絶ブロック！】</span>${shooter.name}のシュートを${defender.name}がバレーボールのスパイクのように叩き落とす！！！` :
                  isChaseDown ? `<span style="color:#e74c3c; font-weight:bold;">【チェイスダウン！】</span>${defender.name}が背後からボードに叩きつけるチェイスダウンブロック！！！` :
                  `✋ ${shooter.name}のシュートを${defender.name}が見事にブロック！`;
    
    writeLog(currentClock, defData.team.name, blkText, (isHighBlock || isChaseDown || isSnatchBlock), [shooter.id, defender.id]);
    
    // スナッチブロックの場合はそのままポゼッション獲得、それ以外は通常
    if (isSnatchBlock) {
        updateBox(defender, 'drb', 1);
        updateBox(defender, 'reb', 1);
        switchPossession(24, true);
    } else {
        switchPossession(24, false);
    }
    continue;
}

// シュート成功判定
const minRate = ["Smothered", "Heavily Contested"].includes(contestLevel) ? 0.15 : 0.25;
const maxRate = contestLevel === "Wide Open" ? 0.95 : 0.85;

if (Math.random() < Math.min(maxRate, Math.max(minRate, rawRate))) {
    const pts = shotType === "three" ? 3 : 2;
    updateBox(shooter, 'fgm', 1);
    updateBox(shooter, 'pts', pts);
    if (shotType === "three") updateBox(shooter, 'tpm', 1);
    addScore(pts);

    const newDiff = currentIsHome ? ((score?.home || 0) - (score?.away || 0)) : ((score?.away || 0) - (score?.home || 0));
    // 条件の厳格化（真のブザービーターとクラッチ判定）
    const isBuzzerBeater = (currentQtr >= 4 && currentClock <= 3 && typeof prevDiff !== 'undefined' && prevDiff <= 0 && newDiff > 0);
    const isClutch = (isClutchTime && typeof prevDiff !== 'undefined' && prevDiff <= 3 && prevDiff >= -3 && newDiff > 0);
    
    let assistText = "";
    const involved = [shooter.id, defender.id];
    
    if (isAssist && actualPasser) {
        updateBox(actualPasser, 'ast', 1);
        involved.push(actualPasser.id);
        const isAlleyOop = ["dunk", "layup"].includes(shotType) && getSafeStat(actualPasser, 'pass') > 100 && getSafeStat(shooter, 'dunk') > 90;
        
        if (isAlleyOop && Math.random() < 0.25) {
            assistText = `<span style="color:#9b59b6; font-weight:bold;">【アリウープ！】</span>${actualPasser.name}の絶妙なロブパスから`;
            shotType = "dunk"; // アリウープ演出用に上書き
        } else {
            const passQuality = getSafeStat(actualPasser, 'pass');
            const passDesc = passQuality > 120 && Math.random() < 0.3 ? '変態的なノールックパス' : 
                             passQuality > 100 && Math.random() < 0.5 ? 'ディフェンスを切り裂くキラーパス' : '的確なパス';
            assistText = `<span class="log-assist">#${actualPasser.num || ''} ${actualPasser.name}の${passDesc} ➔ </span>`;
        }
    }

    // 🏀データベースシステムからテキストとハイライトフラグを取得
    let playResult = getPlayText(shotType, shooter, defender, contestLevel, currentClock, prevDiff);
    let playText = playResult.text;
    let isHigh = playResult.high;

    // クラッチやブザービーター、アンクルブレイクが成立した場合は最優先でテキストを上書き・付加
    if (isBuzzerBeater) {
        playText = `<span style="color:#f1c40f; font-weight:bold; font-size:15px;">🚨【ブザービーター！！！】🚨</span>時間が無い！${shooter.name}が放った劇的なシュートがブザーと共にネットを揺らす！試合を決めた！！！`;
        isHigh = true;
    } else if (isClutch) {
        playText = `<span style="color:#f1c40f; font-weight:bold;">🔥【大逆転クラッチ！】🔥</span>${shooter.name}が土壇場で起死回生のビッグショット！！！ ${playText}`;
        isHigh = true;
    } else if (ankleBreak) {
        playText = `<span style="color:#e67e22; font-weight:bold;">【アンクルブレイク！】</span>${defender.name}が足をもつれて転倒！ ${playText}`;
        isHigh = true;
    } else if (assistText.includes("アリウープ")) {
        playText = `${shooter.name}が空中でボールを押し込んだ！！！`;
        isHigh = true;
    }
    
                        const hName = typeof hTeam !== 'undefined' ? hTeam.name : 'HOME';
                    const aName = typeof aTeam !== 'undefined' ? aTeam.name : 'AWAY';
                    writeLog(gameState.clock, offData.team.name, `${assistText}${playText} [${hName} ${score?.home || 0} - ${score?.away || 0} ${aName}]`, isHigh, involved);
                    
                    switchPossession(24, false);
                    continue; // 🚨【修正追加】これがないとバグります
                }
                else {

    // 1. シュート失敗テキストの拡充と詳細化
    let missText = "";
    
    // 直前のプレイ状況から失敗理由を分岐
    const isToughDefense = (contestLevel === "Smothered" || contestLevel === "Heavily Contested");
    const rMiss = Math.random();

    if (isToughDefense) {
        if (shotType === "three") {
            const toughThreeLogs = [
                `🛡️${defender.name}の執念のクローズアウト！${shooter.name}のタフな3Pはリングを叩く！`,
                `🛡️${defender.name}が指先をかすめるような完璧なコンテスト！${shooter.name}の3Pはショートした！`,
                `🛡️激しいプレッシャー！${shooter.name}は無理な体勢から長距離砲を放つも外れる！`
            ];
            missText = toughThreeLogs[Math.floor(rMiss * toughThreeLogs.length)];
        } else if (shotType === "layup" || shotType === "dunk") {
            const toughInsideLogs = [
                `🛡️${defender.name}がリムプロテクト！${shooter.name}のインサイドへの侵入を完璧に阻んだ！`,
                `🛡️空中のコンタクト！${defender.name}の体を張った守備に${shooter.name}がフィニッシュを決めきれない！`,
                `🛡️${defender.name}が立ちはだかる！${shooter.name}のタフなショットはリングに嫌われた！`
            ];
            missText = toughInsideLogs[Math.floor(rMiss * toughInsideLogs.length)];
        } else {
            const toughMidLogs = [
                `🛡️${defender.name}の完璧なシュートチェック！${shooter.name}はタフショットを強いられ外れる！`,
                `🛡️${defender.name}がシュートコースを完全に塞いだ！${shooter.name}のミドルは不発！`,
                `🛡️息の詰まるディフェンス！焦った${shooter.name}がバランスを崩してミス！`
            ];
            missText = toughMidLogs[Math.floor(rMiss * toughMidLogs.length)];
        }
        writeLog(currentClock, defData.team.name, missText, false, [shooter.id, defender.id]);
    } else {
        // 守備の影響が少ない場合のミス（シュート精度や運による外れ）
        if (shotType === "three") {
            const threeLogs = [
                `${shooter.name}の放った3Pシュートは惜しくもリングに弾かれる。`, 
                `${shooter.name}がオープンで長距離砲を狙うも、ボールはリムを叩く！`,
                `${shooter.name}の3Pシュート！しかしわずかにロング！`,
                `${shooter.name}がリズム良く3Pを放つも、イン＆アウトで外れる！`
            ];
            missText = threeLogs[Math.floor(rMiss * threeLogs.length)];
        } else if (shotType === "dunk") {
            const dunkLogs = [
                `💥${shooter.name}が豪快にリムへアタックするも、ボールを叩きつけ損ねた！`,
                `あっと！${shooter.name}のダンクは無情にもリングの奥に弾かれる！`,
                `${shooter.name}が跳躍するも、フィニッシュのタイミングが合わずミス！`
            ];
            missText = dunkLogs[Math.floor(rMiss * dunkLogs.length)];
        } else if (shotType === "layup") {
            const layupLogs = [
                `${shooter.name}が巧みにインサイドへ切れ込むも、最後のレイアップがこぼれる！`,
                `${shooter.name}のフローターはわずかにショート！`,
                `${shooter.name}がレイアップを放つも、ボールはリングをぐるぐると回って外れた！`
            ];
            missText = layupLogs[Math.floor(rMiss * layupLogs.length)];
        } else {
            const midLogs = [
                `${shooter.name}のジャンプシュートはリングに嫌われる！`,
                `${shooter.name}がフリーで放ったミドルシュートだったが、惜しくも外れる。`,
                `${shooter.name}のプルアップジャンパーはリムの手前を叩く！`
            ];
            missText = midLogs[Math.floor(rMiss * midLogs.length)];
        }
        writeLog(currentClock, offData.team.name, missText, false, [shooter.id]);
    }

    // 2. リバウンダー選出ロジック (全ポジション対応・異常時保護)
    const getRebounder = (teamData, isDefense) => {
        if (!teamData || !Array.isArray(teamData.court) || teamData.court.length === 0) {
            return { id: "dummy", name: "不明な選手", _box: {}, currentStats: {} };
        }
        
        let weights = teamData.court.map(p => {
            let reb = getSafeStat(p, "rebound") || 50;
            let phy = getSafeStat(p, "physical") || 50;
            let def = getSafeStat(p, "defense") || 50;
            
            // ポジション補正を細分化
            let posBonus = 1.0;
            if (p.pos === "C") posBonus = 1.4;
            else if (p.pos === "PF") posBonus = 1.25;
            else if (p.pos === "SF") posBonus = 1.1;
            
            // リバウンド・フィジカル・守備の比重調整
            let baseVal = isDefense 
                ? (reb * 0.5 + phy * 0.3 + def * 0.2) / 50 
                : (reb * 0.6 + phy * 0.4) / 50;
                
            // 上限を20に引き上げ、能力値の高い選手がより確実にリバウンドを取れるように設定
            let weight = Math.min(20, Math.pow(Math.max(0.1, baseVal), 1.6) * posBonus); 
            return (!isFinite(weight) || weight <= 0) ? 1 : weight; 
        });

        let totalWeight = weights.reduce((a, b) => a + b, 0);
        if (!isFinite(totalWeight) || totalWeight <= 0) return teamData.court[0];

        let rand = Math.random() * totalWeight;
        for (let i = 0, cum = 0; i < teamData.court.length; i++) {
            cum += weights[i];
            if (rand < cum) return teamData.court[i];
        }
        return teamData.court[0];
    };

    const offReber = getRebounder(offData, false);
    const defReber = getRebounder(defData, true);
    
    // 3. ORB確率の調整 (基礎確率22%、能力差による変動幅を調整)
    const offPower = (getSafeStat(offReber, "rebound") || 50) + (getSafeStat(offReber, "physical") || 50);
    const defPower = (getSafeStat(defReber, "rebound") || 50) + (getSafeStat(defReber, "physical") || 50);
    const orbChance = Math.min(0.40, Math.max(0.08, 0.22 + ((offPower - defPower) / 2500)));
    
    if (Math.random() < orbChance) {
        // オフェンスリバウンド獲得
        if (offReber._box) {
            offReber._box.orb = (offReber._box.orb || 0) + 1;
            offReber._box.reb = (offReber._box.reb || 0) + 1;
        }
        
        let dunkStat = getSafeStat(offReber, "dunk") || 30;
        let phyStat = getSafeStat(offReber, "physical") || 50;
        let inStat = getSafeStat(offReber, "inside") || getSafeStat(offReber, "layup") || 30; 
        
        // 5. プットバックの種類と判定 (3種類に拡張)
        const rPutback = Math.random();
        let putbackType = "none";
        
        if (currentClock > 0) {
            if (dunkStat > 95 && phyStat > 90 && rPutback < 0.10) {
                putbackType = "putback_dunk";
            } else if (inStat > 85 && phyStat > 80 && rPutback < 0.18) {
                putbackType = "tip_in";
            } else if (inStat > 75 && rPutback < 0.25) {
                putbackType = "quick_layup";
            }
        }

        if (putbackType !== "none") {
            // 得点更新処理 (既存のupdateBoxとaddScoreで整合性を担保)
            if (offReber._box) {
                offReber._box.pts = (offReber._box.pts || 0) + 2;
                offReber._box.fgm = (offReber._box.fgm || 0) + 1;
                offReber._box.fga = (offReber._box.fga || 0) + 1;
            }
            addScore(2); 
            
            let pbText = "";
            if (putbackType === "putback_dunk") {
                pbText = `<span style="color:#e74c3c; font-weight:bold;">【プットバックダンク！】</span>${offReber.name}が空中でボールを掴み、そのまま豪快に叩き込んだ！！`;
            } else if (putbackType === "tip_in") {
                pbText = `🔥 ${offReber.name}がこぼれ球にいち早く反応し、指先でティップインをねじ込む！`;
            } else {
                pbText = `🏀 ${offReber.name}がオフェンスリバウンドから即座にシュート！セカンドチャンスをものにした！`;
            }
            
            // 8. 得点後の整合性担保: 24秒リセットしてターンエンド
            writeLog(currentClock, offData.team.name, pbText, true, [offReber.id]);
            switchPossession(24, false);
            continue;
        }
        
        // 6. プットバックしなかった場合のORB実況バリエーション
        const rOrb = Math.random();
        let orbText = "";
        if (phyStat > 100 && rOrb < 0.4) {
            orbText = `【空中戦】${offReber.name}が複数人に囲まれながらもフィジカルで圧倒し、オフェンスリバウンドをもぎ取った！`;
        } else if (rOrb < 0.7) {
            orbText = `🔄 ${offReber.name}が執念でオフェンスリバウンドを拾い、攻撃権をキープ！セカンドチャンス！`;
        } else {
            orbText = `🏀 ${offReber.name}が良いポジションに入り込み、こぼれ球を確実に確保！`;
        }
        
        writeLog(currentClock, offData.team.name, orbText, false, [offReber.id]);
        keepPossession(14);
        
    } else {
        // 7. ディフェンスリバウンド獲得
        if (defReber._box) {
            defReber._box.drb = (defReber._box.drb || 0) + 1;
            defReber._box.reb = (defReber._box.reb || 0) + 1;
        }
        
        let spdStat = getSafeStat(defReber, "speed") || 50;
        let passStat = getSafeStat(defReber, "pass") || 50;
        let defRebPhy = getSafeStat(defReber, "physical") || 50;
        
        const rDrb = Math.random();
        
        // アウトレットパスと速攻の排他制御・確率適正化
        const isOutletPass = passStat > 95 && rDrb < 0.25;
        const isFastBreak = !isOutletPass && spdStat > 90 && rDrb < 0.45;
        
        let logText = "";
        if (isOutletPass) {
            logText = `🚀 ${defReber.name}がリバウンドを奪うや否や、前線を走る味方へ完璧なアウトレットパス！一気に速攻へ！`;
        } else if (isFastBreak) {
            logText = `⚡ ${defReber.name}がディフェンスリバウンドを回収！そのまま自らドリブルプッシュし速攻を展開！`;
        } else {
            if (defRebPhy > 95 && Math.random() < 0.5) {
                logText = `🛡️ ${defReber.name}が相手をしっかりボックスアウトし、力強くディフェンスリバウンドを死守！`;
            } else {
                logText = `🛡️ ${defReber.name}が高さを活かして確実にディフェンスリバウンドを回収した。`;
            }
        }
                        
                                writeLog(gameState.clock, defData.team.name, logText, (isOutletPass || isFastBreak), [defReber.id]);
                        switchPossession(24, (isOutletPass || isFastBreak));
                        continue;
                    }
                }
            } // 🚨【修正追加】while(gameState.clock > 0) を閉じる
            
            // クォーター終了時の処理（次のクォーターへ）
            gameState.currentQ++;

        } // 🚨【修正追加】while (gameState.currentQ <= gameState.maxQ) を閉じる


        // --- 個人スタッツのグローバル反映＆IndexedDB保存 ---
        const commitToGlobalStats = (teamState, isH) => {
            const joinedLogs = logs.join('');
            const currentRnd = typeof currentRound !== 'undefined' ? currentRound : 1;
            const oppTeamName = isH ? aTeam.name : hTeam.name;
            const isWin = (isH && score.home > score.away) || (!isH && score.away > score.home);

            teamState.team.roster.forEach(p => {
                const gb = p._box; 
                if (!gb) return;

                p.box.g++; 
                if (gb.gs) p.box.gs++;
                Object.keys(gb).forEach(k => { 
                    if (k !== 'g' && k !== 'gs') p.box[k] += gb[k]; 
                });
                
                if (p.isUser) {
                    const logId = `match_${Date.now()}_${currentRnd}_${p.id}`;
                    
                    p.gameLog.push({
                        round: currentRnd, 
                        oppName: oppTeamName,
                        result: isWin ? "WIN" : "LOSE",
                        teamScore: isH ? score.home : score.away, 
                        oppScore: isH ? score.away : score.home,
                        pts: gb.pts || 0, 
                        reb: gb.reb || 0, 
                        ast: gb.ast || 0,
                        logId: logId, 
                        matchDetails: {
                            hTeamName: hTeam.name, 
                            aTeamName: aTeam.name, 
                            hScore: score.home, 
                            aScore: score.away,
                            qScoresHome: [...qScores.home], 
                            qScoresAway: [...qScores.away]
                        }
                    });

                    if (typeof saveToIDB === 'function') {
                        saveToIDB(logId, { logsHtml: joinedLogs })
                            .catch(e => console.error(`[IDB保存エラー] logId: ${logId}`, e));
                    }
                }
            });
        };

        commitToGlobalStats(hData, true); 
        commitToGlobalStats(aData, false);

        // --- ビジュアル（UI）描画処理 ---
        if(isVisual) {
            const scoreEl = document.getElementById('match-score');
            if (scoreEl) scoreEl.innerText = `${score.home} - ${score.away}`;
            
            const t1El = document.getElementById('match-team1');
            if (t1El) t1El.innerText = hTeam.name;
            
            const t2El = document.getElementById('match-team2');
            if (t2El) t2El.innerText = aTeam.name;
            
            let sbHtml = `<tr><th>TEAM</th>`;
            for(let i=0; i<qScores.home.length; i++) sbHtml += `<th>${i<4 ? (i+1)+'Q' : 'OT'+(i-3)}</th>`;
            sbHtml += `<th>TOT</th></tr>`;
            
            sbHtml += `<tr><td class="clickable-team" onclick="showRoster(${hTeam.id})">${hTeam.name}</td>`;
            qScores.home.forEach(qs => sbHtml += `<td>${qs}</td>`);
            sbHtml += `<td style="color:#e74c3c; font-weight:bold;">${score.home}</td></tr>`;
            
            sbHtml += `<tr><td class="clickable-team" onclick="showRoster(${aTeam.id})">${aTeam.name}</td>`;
            qScores.away.forEach(qs => sbHtml += `<td>${qs}</td>`);
            sbHtml += `<td style="color:#e74c3c; font-weight:bold;">${score.away}</td></tr>`;
            
            let sbElem = document.getElementById('match-scoreboard');
            if(sbElem) sbElem.innerHTML = sbHtml;
            
            let logContainer = document.getElementById('match-log');
            if(logContainer) logContainer.innerHTML = logs.reverse().join('');

            let titleHome = document.getElementById('boxscore-title-home');
            if(titleHome) titleHome.innerText = `🏠 ${hTeam.name} 個人スタッツ`;
            
            let titleAway = document.getElementById('boxscore-title-away');
            if(titleAway) titleAway.innerText = `🚀 ${aTeam.name} 個人スタッツ`;

            const fillBoxScoreTable = (targetTableId, roster) => {
                let t = document.getElementById(targetTableId);
                if(!t) return;
                if(typeof generateTableHeaderHtml === "function" && typeof generatePlayerRowHtml === "function"){
                    let html = generateTableHeaderHtml();
                    roster.sort((a,b) => b._box.pts - a._box.pts).forEach(p => {
                        html += `<tr>${generatePlayerRowHtml(p, p._box, false)}</tr>`;
                    });
                    t.innerHTML = html;
                }
            };

            fillBoxScoreTable('match-box-home', hTeam.roster);
            fillBoxScoreTable('match-box-away', aTeam.roster);
            
            if(typeof renderMiniScoreboard === "function") renderMiniScoreboard(hTeam.name, aTeam.name, qScores, score);
            if(typeof switchMatchTab === "function") setTimeout(() => { switchMatchTab('full'); }, 50);
        }
    };
</script>
