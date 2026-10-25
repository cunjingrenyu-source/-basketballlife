メモだよー
function runGameSimulation(hTeam, aTeam, isVisual = true) {
    let logs = [];
    let score = { home: 0, away: 0 };
    let qScores = { home: [], away: [] };
    
    let hData = { team: hTeam, court: [...hTeam.roster.slice(0, 5)] };
    let aData = { team: aTeam, court: [...aTeam.roster.slice(0, 5)] };

    // ==========================================        // =========================================================
        // 【追加】試合開始前に全選手へ「実質ステータス(currentStats)」を付与
        // =========================================================
        if (hTeam && hTeam.roster) hTeam.roster.forEach(p => p.currentStats = getEffectiveStats(p));
        if (aTeam && aTeam.roster) aTeam.roster.forEach(p => p.currentStats = getEffectiveStats(p));

           // --- 試合シミュレーションメインループ ---
              // 【新概念追加】ショットクロックと速攻フラグをQの外（試合全体）で管理する変数として準備
        let shotClock = 24;
        let isFastBreak = false;

        // 🔴【Sランク1・2完全解決】攻守交代・時計・速攻フラグを一元管理する絶対関数
        // この関数を通さない限り攻守は交代しない。これにより「フラグの消し忘れ」「二重処理」を100%防ぐ。
        const switchPossession = (resetClockTo = 24, nextFastBreak = false) => {
            isHomeOffense = !isHomeOffense;
            shotClock = resetClockTo;
            isFastBreak = nextFastBreak;
        };

        // 🔴【Sランク1解決】攻撃権を維持したまま時計だけリセットする関数（ORB用）
        const keepPossession = (resetClockTo = 14) => {
            shotClock = resetClockTo;
            isFastBreak = false; // ORB後はハーフコートオフェンスになるため必ずfalse
        };

        while (currentQ <= maxQ) {

            let clock = (isOverTime) ? 300 : 720; 
            let qName = isOverTime ? `延長第${currentQ - 4}Q(OT)` : `第${currentQ}Q`;
            
            if(isVisual) {
                logs.push(`<div class="log-entry"><span class="log-time">残り--:--</span><span class="log-highlight">🏀 ${qName} 開始 🏀</span></div>`);
                if(currentQ === 1) {
                    writeLog(clock, hTeam.name, `【スターティング5】 ${getNames(hData.court)}`);
                    writeLog(clock, aTeam.name, `【スターティング5】 ${getNames(aData.court)}`);
                    writeLog(clock, "両チーム", `ティップオフ！試合開始！`);
                }
            }

            while(clock > 0) {
                let offData = isHomeOffense ? hData : aData;
                let defData = isHomeOffense ? aData : hData;
                let isHome = isHomeOffense;

                if(Math.random() < 0.15) {
                    checkSubstitution(hData, clock, true);
                    checkSubstitution(aData, clock, false);
                }

                // 【完全対応1: 課題1, 2, 20解決】毎ポゼッション、ポジションベースの完全なマッチアップを構築
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

                // 【課題1,2 解決】ボール運び役（メインハンドラー）の決定
                const getBallHandler = (teamData) => {
                    if (isFastBreak) {
                        // 速攻時はスピードとハンドリングが高い選手が運ぶ
                        return [...teamData.court].sort((a,b) => ((b.currentStats.speed||50)+(b.currentStats.dribble||50)) - ((a.currentStats.speed||50)+(a.currentStats.dribble||50)))[0];
                    }
                    let weights = teamData.court.map(p => {
                        let pm = p.currentStats.playmaking || p.currentStats.pass || 50; 
                        let drb = p.currentStats.dribble || 50;
                        let pass = p.currentStats.pass || 50;
                        let handlerScore = (pm * 1.5) + (drb * 1.0) + (pass * 0.5);
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
                
                // 【完全対応2: 課題1, 48解決】マッチアップ相手を割り当て
                let defender = currentMatchups.get(ballHolder.id) || defData.court[0];

                
                                let prevDiff = isHome ? (score.home - score.away) : (score.away - score.home);
                let isClutchTime = (currentQ >= 4 && clock < 120 && Math.abs(prevDiff) <= 5);
                let mentalBuff = 1.0;
                if (isClutchTime && prevDiff < 0) {
                    mentalBuff = 1.0 + ((ballHolder.currentStats.mental || 50) / 500);
                }

                               // 【新概念：時間消費の根本的再構築と24秒ルールの導入】
                let timeSpent = 0;
                if (isFastBreak) {
                    // 速攻時は2〜5秒で完結
                    timeSpent = Math.floor(Math.random() * 4) + 2;
                } else {
                    // オフェンスIQとディフェンス圧力から組み立て時間を計算
                    let offIQ = (ballHolder.currentStats.playmaking || 50) + (ballHolder.currentStats.pass || 50);
                    let defPres = (defender.currentStats.defense || 50) + (defender.currentStats.speed || 50);
                    let timeBase = 12 + ((defPres - offIQ) / 40); 
                    
                    // 終盤で負けている場合は急いで攻める
                    if (currentQ >= 4 && clock < 180 && prevDiff < 0) {
                        timeBase *= 0.6;
                    }
                    timeSpent = Math.max(5, Math.min(24, Math.floor(timeBase) + Math.floor(Math.random() * 6) - 2));

                    // 💡【課題解決】残りショットクロックが少ない場合、強引にシュートへ行くため消費時間を短縮（自滅バイオレーション防止）
                    if (shotClock > 0 && shotClock <= timeSpent && Math.random() < 0.85) {
                        timeSpent = Math.max(1, shotClock - 1); 
                    }
                }

                if (clock - timeSpent < 0) timeSpent = clock;
                clock -= timeSpent;
                shotClock -= timeSpent;

                offData.court.forEach(p => p._box.min += (timeSpent / 60));
                defData.court.forEach(p => p._box.min += (timeSpent / 60));

                let defPressureBonus = (defender._condStr === "好調" || defender._condStr === "絶好調") ? 0.05 : 0;
                let defensePressure = (((defender.currentStats.defense || 50) * 0.35) / 150) + defPressureBonus; 

                               // 【修正】24秒バイオレーション判定（強制シュートロジックにより適正頻度へ減少）
                if (shotClock <= 0 && clock > 0 && !isFastBreak) {
                    writeLog(clock, defData.team.name, `⏰ショットクロックバイオレーション！${defender.name}ら守備陣の息詰まるプレッシャーが24秒を守り切った！`, false, [defender.id]);
                    switchPossession(24, false); // 🔴新関数適用
                    continue;
                }

                // 【修正】バックコートバイオレーションとプレッシャーの表現強化
                if (!isFastBreak && shotClock <= 16 && Math.random() < 0.015 - ((ballHolder.currentStats.dribble || 50)/5000)) {
                    writeLog(clock, defData.team.name, `🛡️${defender.name}がボール運びに強烈なプレッシャー！相手は後退を余儀なくされバックコートバイオレーション！`, false, [ballHolder.id, defender.id]);
                    ballHolder._box.to++;
                    switchPossession(24, false); // 🔴新関数適用
                    continue;
                }



                // --- A. ハンドラーのターンオーバー & スティール判定 ---
                let handlerStat = ((ballHolder.currentStats.dribble || 50) * 1.2) + ((ballHolder.currentStats.pass || 50) * 0.8) + ((ballHolder.currentStats.speed || 50) * 0.5);
                
                // 【ターンオーバー適正化】基礎リスクを引き上げ、ディフェンス圧力(defensePressure)を直接リスクに加算
                let baseToRisk = isFastBreak ? 0.12 : (0.22 - ((handlerStat * mentalBuff) / 1000));
                let toRisk = baseToRisk + (defensePressure * 0.25); // 守備が強いとTO確率が跳ね上がる
                
                // スタミナ低下による疲労ミス
                if(ballHolder._stamina < 40) toRisk += 0.05;
                if(ballHolder._condStr === "不調") toRisk += 0.05;

                // 🔴【修正】消し飛んでいた TO判定のif文 と stlChanceの計算 を復元
                if (Math.random() < toRisk) {
                    ballHolder._box.to++;
                    let stlChance = ((defender.currentStats.defense || 50) / 150) + (defensePressure * 0.2);
                    let willFastBreak = false;

                    if(Math.random() < Math.max(0.02, stlChance)) {
                        defender._box.stl++;
                        let stlText = isFastBreak ? `${ballHolder.name}の速攻のパスを${defender.name}が見事にパスカット！` : `${ballHolder.name}の隙を突き、${defender.name}が鋭いスティール！`;
                        writeLog(clock, defData.team.name, stlText, true, [ballHolder.id, defender.id]);
                        
                        if ((defender.currentStats.speed || 50) > 80 && Math.random() < 0.6) {
                            willFastBreak = true;
                            writeLog(clock, defData.team.name, `⚡スティールからそのまま速攻へ走る！！！`, true, [defender.id]);
                        }
                    } else {
                        let toText = isFastBreak ? `${ballHolder.name}が速攻で急ぎすぎてボールをこぼしターンオーバー！` : `激しいマークに遭い、${ballHolder.name}がボールを失ってターンオーバー。`;
                        writeLog(clock, offData.team.name, toText, false, [ballHolder.id]);
                    }
                    
                    switchPossession(24, willFastBreak); // 🔴新関数適用
                    continue;
                }


                            // --- 1. パス判断とボール保持者の更新 ---
                // 【課題6,7 解決】パスとプレイメイキングの区別、及びボール保持者の遷移
                let isAssist = false;
                let playmakerBuff = 0;
                let assistText = "";
                let actualPasser = null;
                let shooter = ballHolder; // デフォルトはハンドラーがそのまま打つ

                // 判断力(Playmaking)ベースで「味方にパスするか」を決める
                let playmakingStat = ballHolder.currentStats.playmaking || ballHolder.currentStats.pass || 50;
                let passDecisionProb = Math.min(0.75, (playmakingStat / 150) + 0.15); 

                // 💡【課題解決】ショットクロック残り5秒以下ならパスを極力出さず自分で打ちに行く
                if (shotClock <= 5) {
                    passDecisionProb *= 0.15; 
                }


                if (Math.random() < passDecisionProb) {
                    // パスを選択：シューター（レシーバー）をオフェンス評価値から選ぶ
                    const receiverCandidates = offData.court.filter(p => p.id !== ballHolder.id);
                    let courtEvals = receiverCandidates.map(p => Math.max(1, evalPlayer(p)));
                    let totalEval = courtEvals.reduce((a, b) => a + b, 0);
                    let r = Math.random(); 
                    let cum = 0; 
                    let receiver = receiverCandidates[0];
                    for(let i=0; i < receiverCandidates.length; i++) {
                        cum += (courtEvals[i] / totalEval);
                        if(r < cum) { receiver = receiverCandidates[i]; break; }
                    }

                    // 【修正】パス成功率が最大90%で頭打ちになっていたのを、能力値依存で最大98.5%までスケールさせる
                    let passAbility = ballHolder.currentStats.pass || 50;
                    // パス能力150なら98.5%、50なら約83%の成功率
                    let passSuccessProb = Math.min(0.985, 0.75 + (passAbility / 150) * 0.235);
                    
                    if (Math.random() < passSuccessProb) {
                        // パス成功：ボール保持者がレシーバーに移る
                        actualPasser = ballHolder;
                        shooter = receiver; 
                        isAssist = true; // このレシーバーが決めたらアシスト成立
                        
                        // キラーパス効果（キャッチ＆シュート等で成功率アップ）
                        if (passAbility >= 80) {
                            playmakerBuff = Math.min(0.08, ((passAbility - 80) / 70) * 0.08); 
                        }
                    } else {
                                             // 【課題8 解決】パス失敗（ターンオーバー）
                        actualPasser = ballHolder;
                        actualPasser._box.to++;
                        writeLog(clock, offData.team.name, `${actualPasser.name}のパスが乱れ、ボールがコート外へ。ターンオーバー。`, false, [actualPasser.id]);
                        switchPossession(24, false); // 🔴新関数適用
                        continue;

                    }
                }



                let stat3 = shooter.currentStats.three || shooter.currentStats["3pt"] || shooter.currentStats.tpt || 30;
                let statMid = shooter.currentStats.middle || shooter.currentStats.mid || 30;
                let statIn = shooter.currentStats.layup || shooter.currentStats.inside || 30;
                let statDk = shooter.currentStats.dunk || 30;

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
                defender = currentMatchups.get(shooter.id) || defData.court[0];
                
                let isDriveBeaten = false; 
                let helpDefender = null;

                if (shotType === "dunk" || shotType === "layup") {
                    let driveScore = (shooter.currentStats.speed || 50) + (shooter.currentStats.dribble || 50);
                    let defScore = (defender.currentStats.speed || 50) + (defender.currentStats.defense || 50);
                    
                    if (driveScore > defScore + 10 && Math.random() < 0.6) {
                        isDriveBeaten = true; 
                    }
                    let bigmen = defData.court.filter(p => p.pos === "C" || p.pos === "PF").sort((a,b) => (b.currentStats.defense || 50) - (a.currentStats.defense || 50));
                    if (bigmen.length > 0 && bigmen[0].id !== defender.id) {
                        helpDefender = bigmen[0];
                    }
                }

                // 【課題1】オープン度（Contest Value）の算出。低いほどフリー、高いほど密着。
                let contestValue = 0;
                if (shotType === "three" || shotType === "middle") {
                    // アウトサイド：ディフェンスのスピードとIQによる間合い詰め
                    contestValue = ((defender.currentStats.defense || 50) * 0.6 + (defender.currentStats.speed || 50) * 0.4) / 120;
                } else {
                    // インサイド：フィジカルとリムプロテクト
                    let primaryDef = isDriveBeaten ? 0 : ((defender.currentStats.defense || 50) * 0.5 + (defender.currentStats.physical || 50) * 0.5) / 120;
                    let helpDef = helpDefender ? ((helpDefender.currentStats.defense || 50) * 0.7 + (helpDefender.currentStats.physical || 50) * 0.3) / 150 : 0;
                    contestValue = primaryDef + helpDef;
                    
                    if (helpDefender && (isDriveBeaten || Math.random() < 0.5)) defender = helpDefender; 
                }

                // ランダム要素と時間プレッシャーを加味して最終的な状況を決定
                contestValue *= (0.7 + Math.random() * 0.6);
                if (shotClock <= 3 && !isFastBreak) contestValue += 0.4; // 時間がないとタフショットになる
                if (isFastBreak) contestValue -= 0.5; // 速攻は基本フリー

                // 【課題1】6段階のオープン度(Shot Contest Level)の確定
                let contestLevel = "Wide Open";
                let contestPenalty = 0.0; // 成功率へのマイナス補正
                let staminaDrain = 0;     // 攻撃・守備双方のスタミナ消費量

                if (contestValue <= 0.2) {
                    contestLevel = "Wide Open";
                    contestPenalty = -0.15; // 逆に成功率アップ
                    staminaDrain = 1;
                } else if (contestValue <= 0.5) {
                    contestLevel = "Open";
                    contestPenalty = 0.0;
                    staminaDrain = 2;
                } else if (contestValue <= 0.8) {
                    contestLevel = "Semi-Open";
                    contestPenalty = 0.10;
                    staminaDrain = 3;
                } else if (contestValue <= 1.1) {
                    contestLevel = "Lightly Contested";
                    contestPenalty = 0.20;
                    staminaDrain = 4;
                } else if (contestValue <= 1.4) {
                    contestLevel = "Heavily Contested";
                    contestPenalty = 0.35;
                    staminaDrain = 6;
                } else {
                    contestLevel = "Smothered";
                    contestPenalty = 0.50; // 絶望的なチェック
                    staminaDrain = 8;
                }

                // 【課題58】スタミナ消費の適用。激しいコンテストほど両者消耗する
                if(shooter._stamina) shooter._stamina = Math.max(0, shooter._stamina - staminaDrain);
                if(defender._stamina) defender._stamina = Math.max(0, defender._stamina - staminaDrain);

                // 【課題4】オープン度に応じた守備ログの出力（ログと内部計算の完全一致）
                if (contestLevel === "Smothered") {
                    writeLog(clock, defData.team.name, `🛡️【Smothered】${defender.name}が完全に密着！息の詰まるようなパーフェクトディフェンス！`, false, [defender.id]);
                } else if (contestLevel === "Heavily Contested") {
                    writeLog(clock, defData.team.name, `🛡️【Heavily Contested】${defender.name}が厳しくシュートコースを塞ぐ！タフショットを強いる！`, false, [defender.id]);
                } else if (contestLevel === "Wide Open") {
                    writeLog(clock, offData.team.name, `🎯【Wide Open】ディフェンスがいない！${shooter.name}が完全にフリーな状態を作る！`, false, [shooter.id]);
                } else if (helpDefender && (contestLevel === "Lightly Contested" || contestLevel === "Semi-Open")) {
                    writeLog(clock, defData.team.name, `🛡️${helpDefender.name}が瞬時にヘルプに入り、シュートチェックに飛ぶ！`, false, [helpDefender.id]);
                }


                // --- 2. ファウル判定＆終盤ファウルゲーム（課題43〜51対応・超完全版） ---
                let isFoulGame = false;

                // 【課題43】守備側の点差を正しく計算（負の値なら守備側がビハインド）
                let defDiff = isHomeOffense ? (score.away - score.home) : (score.home - score.away);
                
                // 【課題43, 51】ファウルゲームの発動条件（守備側が1〜8点負けていて、第4Q残り90秒以内）
                if (currentQ >= 4 && clock <= 90 && defDiff < 0 && defDiff >= -8) {
                    isFoulGame = true;
                }

                // ファウルゲーム発動時は95%、通常時は能力に応じた確率
                                // 【追加視点⑨】ファウル判定とオープン度の連動。激しいチェックはファウルリスクが跳ね上がる。
                let baseFoulRisk = (0.08 - ((defender.currentStats.defense || 50) / 1500) + ((defender.currentStats.physical || 50) / 1000));
                if (contestLevel === "Heavily Contested") baseFoulRisk += 0.04;
                if (contestLevel === "Smothered") baseFoulRisk += 0.12; // 密着時はファウルしやすい
                if (defender._stamina < 30) baseFoulRisk += 0.05; // 疲労による手を出してしまうファウル

                let foulRisk = isFoulGame ? 0.95 : baseFoulRisk;

                
                if (Math.random() < Math.min(0.95, Math.max(0.02, foulRisk))) {
                    defender._box.pf++; // ファウルを加算
                    
                    const side = isHomeOffense ? 'home' : 'away';
                    const qIdx = currentQ - 1;

                    const addScore = (pts) => {
                        score[side] += pts;
                        if (qScores[side][qIdx] === undefined) qScores[side][qIdx] = 0;
                        qScores[side][qIdx] += pts;
                        if (Array.isArray(offData?.court)) offData.court.forEach(p => { if(p._box) p._box.plusMinus += pts; });
                        if (Array.isArray(defData?.court)) defData.court.forEach(p => { if(p._box) p._box.plusMinus -= pts; });
                    };

                    // 【課題47】フリースロー能力の直接反映（freeThrowやftが存在すれば優先、なければミドルとスリーの平均）
                    let ftStat = shooter.currentStats.freeThrow || shooter.currentStats.ft;
                    if (!ftStat) {
                        const midStat = shooter.currentStats.middle || 50;
                        const threeStat = shooter.currentStats.three || 50;
                        ftStat = (midStat + threeStat) / 2;
                    }
                    const ftRate = Math.min(0.95, Math.max(0.50, 0.50 + ((ftStat / 150) * 0.45)));

                    // 【課題44, 50】ファウルゲーム（意図的ファウル）と通常ファウルの完全分離
                    if (isFoulGame) {
                        // 意図的ファウル：シュート動作前（ノンシューティング）とみなし、ボーナスによる2スローとする。AND-1は発生しない。
                        writeLog(clock, defData.team.name, `${defender.name}が時計を止める意図的なファウル！${shooter.name}がフリースロー獲得（2投）！`, false, [shooter.id, defender.id]);
                        shooter._box.fta += 2;
                        
                        for (let f = 1; f <= 2; f++) {
                            if (Math.random() < ftRate) {
                                shooter._box.ftm++; 
                                shooter._box.pts++;
                                addScore(1);
                                writeLog(clock, shooter.name, `フリースロー ${f}本目：決まった！ [${score.home} - ${score.away}]`, false, [shooter.id]);
                            } else {
                                writeLog(clock, shooter.name, `フリースロー ${f}本目：外れる！`, false, [shooter.id]);
                            }
                        }
                    } else {
                        // 【課題45, 46】通常のシュートファウル（AND-1判定と整合性の修正）
                        let rawSuccessRate = baseRate * shooter._cond * mentalBuff - (defensePressure * 0.7) + playmakerBuff;
                        
                        // 実際のシュート成功率に依存してAND-1確率を算出
                        let and1Chance = 0.01;
                        if (shotType === "dunk" || shotType === "layup") {
                            and1Chance = Math.max(0.05, rawSuccessRate * 0.6 + (((shooter.currentStats.physical || 50) / 200) * 0.15));
                        } else if (shotType === "middle") {
                            and1Chance = Math.max(0.02, rawSuccessRate * 0.3);
                        } else if (shotType === "three") {
                            and1Chance = Math.max(0.01, rawSuccessRate * 0.1); // 3PでのAND-1確率（レアケース）
                        }
                        
                        const isAnd1 = Math.random() < and1Chance && clock > 5;

                        if (isAnd1) {
                            shooter._box.fga++;
                            shooter._box.fgm++; 
                            const pts = (shotType === "three") ? 3 : 2;
                            if(shotType === "three") {
                                shooter._box.tpa++;
                                shooter._box.tpm++;
                            }
                            shooter._box.pts += pts; 
                            addScore(pts);

                            const and1Text = `<span style="color:#e74c3c; font-weight:bold; font-size:14px;">🔥【AND-1!!!】🔥</span>${shooter.name}が${defender.name}のファウルを受けながらも、執念で${shotType === "three" ? "3P" : "シュート"}をねじ込んだ！！！${shotType === "three" ? "4点プレーのチャンス！" : ""}`;
                            writeLog(clock, offData.team.name, and1Text, true, [shooter.id, defender.id]);

                            shooter._box.fta += 1;
                            if (Math.random() < ftRate) {
                                shooter._box.ftm++; 
                                shooter._box.pts++;
                                addScore(1);
                                writeLog(clock, shooter.name, `ボーナススロー：決まった！ [${score.home} - ${score.away}]`, false, [shooter.id]);
                            } else {
                                writeLog(clock, shooter.name, `ボーナススロー：外れる！`, false, [shooter.id]);
                            }
                        } else {
                            // シュート失敗、フリースローのみ
                            const ftCount = (shotType === "three") ? 3 : 2; 
                            writeLog(clock, defData.team.name, `${defender.name}がシュートモーションに対してファウル！${shooter.name}がフリースロー獲得（${ftCount}投）！`, false, [shooter.id, defender.id]);
                            
                            shooter._box.fta += ftCount;
                            
                            for (let f = 1; f <= ftCount; f++) {
                                if (Math.random() < ftRate) {
                                    shooter._box.ftm++; 
                                    shooter._box.pts++;
                                    addScore(1);
                                    writeLog(clock, shooter.name, `フリースロー ${f}本目：決まった！ [${score.home} - ${score.away}]`, false, [shooter.id]);
                                } else {
                                    writeLog(clock, shooter.name, `フリースロー ${f}本目：外れる！`, false, [shooter.id]);
                                }
                            }
                        }
                    }
                    
                    // 【課題49】ファウルアウト（退場）処理の厳密化
                    if (defender._box.pf >= 6) {
                        writeLog(clock, defData.team.name, `<span style="color:red; font-weight:bold;">【ファウルアウト】</span>${defender.name}が6回目のファウル！退場となります！`, true, [defender.id]);
                        // 強制交代を実行（ここで defData.court 等の内部参照が更新されることを前提）
                        checkSubstitution(defData, clock, !isHomeOffense, true); 
                    }

                                       // 【課題48】フリースロー中はクロックを進めない仕様を維持し、ポゼッションを切り替えて次のプレーへ
                    switchPossession(24, false); // 🔴新関数適用
                    continue; // 判定が終了したため、通常のシュート処理には進まずループを抜ける
                }


                // ファウルが起きなかった場合のみ、正規のシュートとしてFGAを加算
                shooter._box.fga++;
                if(shotType === "three") shooter._box.tpa++;

                              // --- 3. ブロック＆シュート成功判定（オープン度とタフショット処理） ---
                let abilityBonus = ((statUsed - 30) / 120) * 0.30;
                
                // 【課題1】シューターのIQ・シュート力による「タフショット適性（ペナルティ軽減）」
                // 優秀なシューターは Heavily Contested でもペナルティを軽減してねじ込める
                let toughShotMaker = ((statUsed + (shooter.currentStats.mental || 50)) / 250); 
                let actualPenalty = contestPenalty > 0 ? Math.max(0, contestPenalty - (toughShotMaker * 0.15)) : contestPenalty;
                
                // 【課題54】クラッチタイムのスーパーエースはペナルティをほぼ無視する（メンタルバフ）
                if (isClutchTime && (shooter.currentStats.mental || 50) > 90) actualPenalty *= 0.5;

                // 基礎確率 ＋ 能力ボーナス ＋ アシストバフ − 状況ペナルティ(オープン度)
                let rawRate = (baseRate + abilityBonus) * shooter._cond - actualPenalty + playmakerBuff;

                // スタミナ低下によるシュート確率減衰
                if (shooter._stamina < 30) rawRate -= 0.08;

                let ankleBreak = false;
                if(shooter.currentStats.dribble > defender.currentStats.defense + 20 && Math.random() < 0.15 * shooter._cond) {
                    ankleBreak = true;
                    rawRate += 0.20; // アンクルブレイク時は実質Wide Open相当のバフ
                }

                // ブロック確率（オープン度が高い＝密着しているほどブロックされやすい）
                let blockChance = ((defender.currentStats.defense + defender.currentStats.physical) / 300) * 0.08;
                if (contestLevel === "Smothered") blockChance += 0.06;
                if (contestLevel === "Heavily Contested") blockChance += 0.03;
                if (shotType === "dunk") blockChance -= 0.03; 
                if (shotType === "layup" && statUsed > 110) blockChance -= 0.04; 

                if(Math.random() < Math.max(0.01, blockChance) && !ankleBreak) {
                    defender._box.blk++;
                    let isBlockHigh = false;
                    let blkText = "";
                    if (defender.currentStats.physical > 110 && defender.currentStats.defense > 100 && Math.random() < 0.3) {
                        blkText = `<span style="color:#e74c3c; font-weight:bold;">【超絶ブロック！】</span>${shooter.name}のシュートを${defender.name}がバレーボールのスパイクのように客席へ叩き落とす！！！`;
                        isBlockHigh = true;
                    } else if (defender.currentStats.speed > 100 && Math.random() < 0.3) {
                        blkText = `<span style="color:#e74c3c; font-weight:bold;">【チェイスダウン！】</span>${shooter.name}の背後から迫った${defender.name}がボードに叩きつけるチェイスダウンブロック！！！`;
                        isBlockHigh = true;
                    } else {
                        blkText = `${shooter.name}のシュートを${defender.name}が見事にブロック！`;
                    }
                                      writeLog(clock, defData.team.name, blkText, isBlockHigh, [shooter.id, defender.id]);
                    switchPossession(24, false); // 🔴新関数適用（ブロック後は一旦セットオフェンス）
                    continue;

                }

                // 【課題1】最終成功率のキャップ。Wide Openなら最大95%、Smotheredなら最低15%など状況でキャップを変える
                let minRate = (contestLevel === "Smothered" || contestLevel === "Heavily Contested") ? 0.15 : 0.25;
                let maxRate = (contestLevel === "Wide Open") ? 0.95 : 0.85;
                let finalSuccessRate = Math.min(maxRate, Math.max(minRate, rawRate));


                if (Math.random() < finalSuccessRate) {
                    const isThree = (shotType === "three");
                    const pts = isThree ? 3 : 2;
                    const targetSide = isHome ? 'home' : 'away';

                    shooter._box.fgm++;
                    shooter._box.pts += pts;
                    if (isThree) shooter._box.tpm++;
                    
                    score[targetSide] += pts;
                    const qIdx = currentQ - 1;
                    qScores[targetSide][qIdx] = (qScores[targetSide][qIdx] || 0) + pts;

                    const newDiff = isHome ? (score.home - score.away) : (score.away - score.home);
                    const isBuzzerBeater = (currentQ >= 4 && clock <= 5 && prevDiff <= 0 && newDiff >= 0);
                    const isClutch = (isClutchTime && prevDiff < 0 && newDiff > 0);

                    offData.court.forEach(p => p._box.plusMinus += pts);
                    defData.court.forEach(p => p._box.plusMinus -= pts);

                    let playText = "";
                    let isHigh = false;
                    const involved = [shooter.id, defender.id];
                    // 【課題11 解決】旧システムの後付けサイコロアシストを廃止。実際のパサー(actualPasser)が記録される。
                    if (isAssist && actualPasser) {
                        actualPasser._box.ast++;
                        involved.push(actualPasser.id);
                        
                        const dunkVal = shooter.currentStats.dunk || 50;
                        const layupVal = shooter.currentStats.layup || shooter.currentStats.inside || 50;
                        const passVal = actualPasser.currentStats.pass || 50;

                        // 【課題9 解決】キャッチ＆シュートをただの演出ではなく、実際のパス連携の結果として表示
                        const isAlleyOop = (shotType === "dunk" || shotType === "layup") && passVal > 100 && (dunkVal > 90 || layupVal > 100);
                        if (isAlleyOop && Math.random() < 0.3) {
                            playText = `<span style="color:#9b59b6; font-weight:bold;">【アリウープ！】</span>${actualPasser.name}の絶妙なロブパスを、空中で受け取った${shooter.name}がそのまま豪快にリングへ叩き込んだ！！！`;
                            isHigh = true;
                        } else if (passVal > 120 && Math.random() < 0.3) {
                            assistText = `<span class="log-assist">#${actualPasser.num} ${actualPasser.name}の変態的なノールックパス ➔ </span>`;
                        } else {
                            assistText = `<span class="log-assist">#${actualPasser.num} ${actualPasser.name}の的確なアシスト ➔ </span>`;
                        }
                    }



                    // --- 個人技テキスト（すべての条件分岐と記述を完全維持） ---
                    if (!playText) {
                        const r = Math.random();
                        
                        if (isBuzzerBeater) {
                            playText = `<span style="color:#f1c40f; font-weight:bold; font-size:14px;">🚨【ブザービーター！！！】🚨</span>時間が無い！${shooter.name}が放った劇的なシュートがブザーと同時にネットを揺らす！！！`;
                            isHigh = true;
                        } else if (isClutch) {
                            playText = `<span style="color:#f1c40f; font-weight:bold; font-size:14px;">🔥【大逆転クラッチ！】🔥</span>${shooter.name}が土壇場で起死回生のシュートをねじ込んだ！！！`;
                            isHigh = true;
                        } else if (ankleBreak) {
                            playText = `<span style="color:#e67e22; font-weight:bold;">【アンクルブレイク！】</span>${shooter.name}の鋭いクロスオーバーに${defender.name}が足をもつれて転倒！！そのまま余裕で沈めた！！！`;
                            isHigh = true;
                        } else if (isThree) {
                            if (shooter.stats.three > 120 && r < 0.3) {
                                playText = `${shooter.name}がロゴ付近から放つディープスリー！！美しい弧を描きリングに吸い込まれた！！！`;
                                isHigh = true;
                            } else if (shooter.stats.three > 90 && defender.stats.defense > 90 && r < 0.7) {
                                playText = `<span style="color:#e74c3c; font-weight:bold;">【タフショット！】</span>ディフェンスがガチガチに密着する厳しい状況下、${shooter.name}がタフな3Pを強引に沈めた！`;
                                isHigh = true;
                            } else {
                                playText = r > 0.85 ? `${shooter.name}がスクリーンを使い3P！決まった！` : `${shooter.name}がキャッチ＆シュートで3Pを沈めた！`;
                            }
                        } else if (shotType === "dunk") {
                            if (shooter.stats.dunk > 130 && r < 0.15) {
                                playText = `<span style="color:#e74c3c; font-weight:bold;">【伝説級ダンク！】</span>${shooter.name}がフリースローラインから跳躍し、空を歩くようなダンクを叩き込んだ！！！`;
                                isHigh = true;
                            } else if (shooter.stats.dunk > 110 && r < 0.35) {
                                playText = `${shooter.name}が空中で腕を回す豪快なウィンドミルダンク炸裂！！！`;
                                isHigh = true;
                            } else if (shooter.stats.physical > 100 && r < 0.6) {
                                playText = `<span style="color:#e74c3c; font-weight:bold;">【ポスタライズ！】</span>${shooter.name}が${defender.name}ごと吹き飛ばす強烈なダンクを決めたーーーっ！！！`;
                                isHigh = true;
                            } else {
                                playText = `${shooter.name}が豪快なボースハンドダンクを決めた！`;
                            }
                        } else if (shotType === "layup") {
                            const lu = shooter.stats.layup;
                            if (lu > 120 && r < 0.15) {
                                playText = `<span style="color:#e74c3c; font-weight:bold;">【サーカスショット！】</span>ブロックを空中で2度躱す！${shooter.name}の変態的なトリプルクラッチ！！`;
                                isHigh = true;
                            } else if (lu > 100 && r < 0.3) {
                                playText = `${shooter.name}がユーロステップでディフェンダーを嘲笑うかのように抜き去りレイアップ！`;
                                isHigh = true;
                            } else if (lu > 90 && r < 0.45) {
                                playText = `${shooter.name}が空中でボールを動かす優雅なジェリー・レイアップを沈めた！`;
                            } else if (lu > 80 && r < 0.6) {
                                playText = `${shooter.name}がビッグマンのブロックを嘲笑うかのような高い弧を描くティアドロップ（フローター）！`;
                            } else if (lu > 80 && r < 0.7) {
                                playText = `${shooter.name}が意表を突くワンステップ（ヴェロ・ステップ）でタイミングをずらしレイアップ！`;
                            } else if (shooter.stats.physical > 90 && r < 0.8) {
                                playText = `${shooter.name}がギャロップステップ（プロホップ）で強引にスペースをこじ開けレイアップ！`;
                            } else if (r < 0.9) {
                                playText = `${shooter.name}がゴール下を潜り抜け、リング越しにリバース・レイアップ（リーチバック）！`;
                            } else {
                                playText = `${shooter.name}がダブルクラッチで華麗にレイアップを沈めた！`;
                            }
                        } else { 
                            if (shooter.stats.dribble > 100 && r < 0.3) {
                                playText = `${shooter.name}が鮮やかなスピンムーブからフェイダウェイ！美しく射抜いた！`;
                                isHigh = true;
                            } else if (shooter.stats.dribble > 90 && r < 0.6) {
                                playText = `${shooter.name}がステップバックからジャンプシュート！綺麗に決まった！`;
                            } else if (shooter.stats.middle > 100 && defender.stats.defense > 90 && r < 0.8) {
                                playText = `タフな体勢から${shooter.name}がミドルシュートをねじ込む！`;
                            } else {
                                playText = `${shooter.name}がミドルレンジから確実なジャンプシュート！`;
                            }
                        }
                    }
                    writeLog(clock, offData.team.name, `${assistText}${playText} [${hTeam.name} ${score.home} - ${score.away} ${aTeam.name}]`, isHigh, involved);
                    switchPossession(24, false); // 🔴新関数適用（得点後は必ず相手の24秒スタート）
                } 

                // --- D. シュート失敗 & リバウンド判定 ---
                else {
                    // 💡【課題解決】ディフェンス圧力が高かった場合は「守備の勝利」としてログ出力
                    let missText = "";
                    if (defensePressure > 0.45) {
                        const missLogs = [
                            `🛡️${defender.name}のタフなディフェンス！${shooter.name}は苦しい体勢からシュートを強いられ外れる！`,
                            `🛡️${defender.name}の厳しいチェック！${shooter.name}のシュートが大きく逸れた！`,
                            `🛡️${defender.name}が相手を追い込み、${shooter.name}にタフショットを打たせた！スタッツに残らない好守備！`,
                            `🛡️${defender.name}の守備に焦った${shooter.name}が無理なシュートを選択しミス！`,
                            `🛡️${defender.name}が完璧なコースチェック！${shooter.name}のシュートをプレッシャーで外させた！`
                        ];
                        missText = missLogs[Math.floor(Math.random() * missLogs.length)];
                        writeLog(clock, defData.team.name, missText, false, [shooter.id, defender.id]);
                    } else {
                        missText = (shotType === "three") ? `${shooter.name}の3Pシュートはリングに弾かれる。` : `${shooter.name}がシュートを放つもリングに弾かれる！`;
                        writeLog(clock, offData.team.name, missText, false, [shooter.id]);
                    }

                    
                    // 【課題8, 9解決】能力値を安全に取得（0を正常値として扱い、undefined/NaN/Infinityを完全保護）
                    const getStat = (player, key, fallback = 50) => {
                        if (!player || !player.currentStats) return fallback;
                        const val = player.currentStats[key];
                        return (typeof val === "number" && isFinite(val)) ? val : fallback;
                    };

                    // 【課題1, 4, 13, 14, 20解決】得点・スタッツ・プラスマイナスの共通記録処理
                    const recordBasket = (player, pts, isThree = false) => {
                        if (!player || !player._box) return; // _boxが存在しない場合のエラー防止
                        player._box.pts += pts;
                        player._box.fgm++;
                        player._box.fga++;
                        if (isThree) {
                            player._box.tpm++;
                            player._box.tpa++;
                        }
                        
                        // 【課題1解決】得点先は「現在の攻撃チーム」に基づく
                        const side = isHomeOffense ? 'home' : 'away';
                        const qIdx = currentQ - 1;
                        score[side] += pts;
                        
                        // 【課題20解決】配列の未初期化インデックスへの安全対策
                        if (qScores[side][qIdx] === undefined) qScores[side][qIdx] = 0;
                        qScores[side][qIdx] += pts;
                        
                        // 【課題4, 6解決】プラスマイナス更新時の安全ガード
                        if (Array.isArray(offData?.court)) {
                            offData.court.forEach(p => { if (p && p._box) p._box.plusMinus += pts; });
                        }
                        if (Array.isArray(defData?.court)) {
                            defData.court.forEach(p => { if (p && p._box) p._box.plusMinus -= pts; });
                        }
                    };

                                  // 【課題3, 7, 8解決】安全な重み付きリバウンダー選出
                    // 【完全対応7: 課題16, 18解決】isDefense引数を追加し、DRB時にはディフェンス能力（ボックスアウト）を加味する
                    const getRebounder = (teamData, isDefense) => {
                        // 【課題3解決】コートが空の場合は、エラーを起こさない完全なモックダミーを返す
                        if (!teamData || !Array.isArray(teamData.court) || teamData.court.length === 0) {
                            return { 
                                id: "dummy", 
                                name: "不明な選手", 
                                _box: { reb: 0, orb: 0, drb: 0, pts: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, plusMinus: 0 }, 
                                currentStats: {} 
                            };
                        }
                        
                        let weights = teamData.court.map(p => {
                            let reb = getStat(p, "rebound", 50);
                            let phy = getStat(p, "physical", 50);
                            let def = getStat(p, "defense", 50);
                            let posBonus = (p.pos === "C" || p.pos === "PF") ? 1.3 : 1.0; 
                            
                            // 守備側ならディフェンス能力（ボックスアウト技術）をリバウンド力に加算
                            let baseVal = isDefense 
                                ? (reb + (phy * 0.4) + (def * 0.3)) / 50 
                                : (reb + (phy * 0.5)) / 50;
                            
                            // 【課題8解決】極端な重みを防ぐため上限10を設ける
                            let weight = Math.min(10, Math.pow(Math.max(0.1, baseVal), 1.5) * posBonus); 
                            
                            return (!isFinite(weight) || weight <= 0) ? 1 : weight; 
                        });

                        let totalWeight = weights.reduce((a, b) => a + b, 0);
                        if (!isFinite(totalWeight) || totalWeight <= 0) return teamData.court[0];

                        let rand = Math.random() * totalWeight;
                        let cum = 0;
                        for (let i = 0; i < teamData.court.length; i++) {
                            cum += weights[i];
                            if (rand < cum) return teamData.court[i];
                        }
                        return teamData.court[0];
                    };

                    // オフェンス側はisDefense=false、ディフェンス側はisDefense=true
                    const offReber = getRebounder(offData, false);
                    const defReber = getRebounder(defData, true);

                    
                    // リバウンドパワー計算
                    const offPower = getStat(offReber, "rebound", 50) + getStat(offReber, "physical", 50);
                    const defPower = getStat(defReber, "rebound", 50) + getStat(defReber, "physical", 50);
                    
                    // 【課題5解決】ORB確率。基本確率25% + 能力差/2000 は仕様として維持しつつクランプ。
                    const orbChance = Math.min(0.45, Math.max(0.05, 0.25 + ((offPower - defPower) / 2000)));
                    
                                                         if (Math.random() < orbChance) {
                        // オフェンスリバウンド(ORB)
                        if (offReber._box) {
                            offReber._box.orb++; 
                            offReber._box.reb++;
                        }
                        
                        let dunkStat = getStat(offReber, "dunk", 30);
                        let inStat = getStat(offReber, "inside", getStat(offReber, "layup", 30)); 
                        let phyStat = getStat(offReber, "physical", 50);
                        
                        let putbackType = "none";
                        let putbackChance = 0;
                        
                        if (dunkStat > 90 && phyStat > 90) {
                            putbackChance = 0.12; 
                            putbackType = "dunk";
                        } else if (inStat > 80 && phyStat > 80) {
                            putbackChance = 0.06; 
                            putbackType = "tipin";
                        }
                        
                        if (clock > 0 && putbackType !== "none" && Math.random() < putbackChance) {
                            recordBasket(offReber, 2, false);
                            let pbText = (putbackType === "dunk") 
                                ? `<span style="color:#e74c3c; font-weight:bold;">【プットバック！】</span>${offReber.name}がオフェンスリバウンドを空中で掴み、そのまま強烈なダンクを叩き込んだ！！`
                                : `<span style="color:#e74c3c; font-weight:bold;">【ティップイン！】</span>${offReber.name}がオフェンスリバウンドをそのまま押し込んだ！！`;

                                                        writeLog(clock, offData.team.name, pbText, true, [offReber.id]);
                            switchPossession(24, false); // 🔴新関数適用（得点後は相手の24秒）
                            continue;

                        } else if (phyStat > 110 && Math.random() < 0.4) {
                            writeLog(clock, offData.team.name, `【空中戦】${offReber.name}がフィジカルで圧倒し、強引にオフェンスリバウンドをもぎ取った！`, false, [offReber.id]);
                        } else {
                            writeLog(clock, offData.team.name, `${offReber.name}が執念でオフェンスリバウンドを拾う！`, false, [offReber.id]);
                        }
                                        // 【新概念】オフェンスリバウンド時は14秒にリセット
                        keepPossession(14); // 🔴新関数適用（攻撃権維持、14秒リセット、速攻解除）
                        
                    } else {
                        // ディフェンスリバウンド(DRB)
                        if (defReber._box) {
                            defReber._box.drb++; 
                            defReber._box.reb++;
                        }
                        
                        let spdStat = getStat(defReber, "speed", 50);
                        let passStat = getStat(defReber, "pass", 50);
                        let nextFb = false;
                        
                        // 【新概念：DRBからの速攻展開】
                        if ((spdStat > 90 || passStat > 90) && Math.random() < 0.35) {
                            nextFb = true;
                            if (passStat > 90 && Math.random() < 0.5) {
                                writeLog(clock, defData.team.name, `⚡${defReber.name}がリバウンドから前線へ鋭いアウトレットパス！一気に速攻へ！`, true, [defReber.id]);
                            } else {
                                writeLog(clock, defData.team.name, `⚡${defReber.name}がディフェンスリバウンドを回収し、自らドリブルで速攻を展開！`, true, [defReber.id]);
                            }
                        } else {
                            writeLog(clock, defData.team.name, `${defReber.name}が確実にディフェンスリバウンドを回収。`, false, [defReber.id]);
                        }
                        
                        switchPossession(24, nextFb); // 🔴新関数適用（DRB後は攻守交代、24秒、速攻判定反映）
                        continue;
                    }

                }
            } // while (clock > 0) の正常終了
            
            currentQ++;
        } // while (currentQ <= maxQ) の正常終了
    // 最後に結果を返す
    return { score, qScores, logs, hData, aData };
}

let isHomeOffense = Math.random() > 0.5;
        let currentQ = 1;
        let maxQ = 4;
        let isOverTime = false;

         

