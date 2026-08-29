window.__require = function a(t, e, n) {
	function i(u, s) {
		if (!e[u]) {
			if (!t[u]) {
				var r = u.split("/");
				if (r = r[r.length - 1], !t[r]) {
					var c = "function" == typeof __require && __require;
					if (!s && c) return c(r, !0);
					if (o) return o(r, !0);
					throw new Error("Cannot find module '" + u + "'")
				}
				u = r
			}
			var l = e[u] = {
				exports: {}
			};
			t[u][0].call(l.exports, function(a) {
				return i(t[u][1][a] || a)
			}, l, l.exports, a, t, e, n)
		}
		return e[u].exports
	}
	for (var o = "function" == typeof __require && __require, u = 0; u < n.length; u++) i(n[u]);
	return i
}({
	AD_4399: [function(a, t, e) {
		"use strict";
		cc._RF.push(t, "3c931s1L45Jf52uteisx9aR", "AD_4399"), window.AD_4399 = {
			moreGame4399: function() {
			},
			getPlayTimes: function() {
				return 99999;
			},
			shiPin: function() {
				cc.game.pause();
				this.valume = 0
				gameapi.playReward((succeed, isError) => {
						if (succeed) {
							cc.game.resume();
							AD.reward();					
						} else {
							adToast("Ads Not Ready. Please Refresh Game.", 2000);
							cc.game.resume();
						}
					});
			},
			uploading4399Rank: function() {

			},
			show4399Rank: function() {

			}
		}, cc._RF.pop()
	}, {}],
	globalData: [function(a, t, e) {
		"use strict";
		cc._RF.push(t, "0d035p4mEFLZp6TvkrDvVq8", "globalData"), window.globalData = {
			clearDataNow: !1,
			keyFirst: "key_firstXiangSuSheJi1",
			keyData: "key_dataXiangSuSheJi1",
			firstToMenu: !0,
			modeType: "个人竞技",
			qiangHuaCastArr: [5, 10, 15, 20, 25, 30],
			junXianArr: ["Private", "Corporal", "Staff Sergeant", "Sergeant", "Second Lieutenant", "Lieutenant", "Captain", "Major", "Lieutenant Colonel", "Colonel", "Big Colonel", "Major General", "Lieutenant General", "Admiral", "Marshal"],
			hpArr: [200, 200, 200, 250, 250, 250, 300, 300, 300, 350, 350, 350, 400, 400, 400, 400, 450, 450, 450],
			roleType: 0,
			gunType: 0,
			signAutoShow: !1,
			xianLiangRoleSecond: 86400,
			btnClickTimes: 0,
			tuiJianTimes: 0,
			data: {
				coinNum: 0,
				diamondNum: 0,
				roleUnlockState: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				gunUnlockState: [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				gunLevel: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				chengHaoEP: 0,
				qiangHuaNum: 0,
				qiangHuaNumForever: 0,
				qiangHuaLevel: 0,
				qiangHuaLine: [0, -1, -1, -1, -1, -1],
				qiangHuaObj: {
					hpMax: 0,
					moveSpeed: 0,
					baoJiRate: 0,
					reviveTime: 0,
					wuDiTime: 0,
					hurtRate: 0,
					c4AnZhuangTime: 0,
					c4ChaiChuTime: 0
				},
				junXianHadGetRewardLevel: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
				signData: [null, null, null, null, null, null, null],
				signFirstToGame: !0,
				signHadShowTodayDate: null,
				chouJiangDate: null,
				huoDongData: [0, 0, 0, 0, 0],
				huoDongDataHadGet: [!1, !1, !1, !1, !1],
				playTimes: 0,
				showHongDianNewGunLevel: 0,
				xianLiangRoleSecond: 86400,
				hadGuide: !1
			},
			getXianLiangRoleSecond: function() {
				return this.data.xianLiangRoleSecond
			},
			setXianLiangRoleSecond: function() {
				this.data.xianLiangRoleSecond = this.xianLiangRoleSecond, this.saveData()
			},
			getShowHongDianNewGun: function() {
				return this.data.showHongDianNewGunLevel
			},
			setShowHongDianNewGun: function() {
				this.data.showHongDianNewGunLevel = this.getChengHaoLevel(), this.saveData()
			},
			getPlayTimes: function() {
				return this.data.playTimes
			},
			setPlayTimes: function() {
				this.data.playTimes++, this.saveData()
			},
			getJunXianHadGetRewardLevel: function(a) {
				return this.data.junXianHadGetRewardLevel[a]
			},
			setJunXianHadGetRewardLevel: function(a) {
				this.data.junXianHadGetRewardLevel[a]++, this.saveData()
			},
			getHuoDongDataHadGet: function(a) {
				if (this.getHuoDongDataIndex(a) > -1) return this.data.huoDongDataHadGet[this.getHuoDongDataIndex(a)]
			},
			setHuoDongDataHadGet: function(a) {
				this.getHuoDongDataIndex(a) > -1 && (this.data.huoDongDataHadGet[this.getHuoDongDataIndex(a)] = !0, this.saveData())
			},
			getHuoDongDataIndex: function(a) {
				var t = -1;
				switch (a) {
				case "竞技先锋":
					t = 0;
					break;
				case "拆弹专家":
					t = 1;
					break;
				case "抢旗模式":
					t = 2;
					break;
				case "末日使者":
					t = 3;
					break;
				case "金枪大师":
					t = 4
				}
				return t
			},
			getHuoDongData: function(a) {
				if (this.getHuoDongDataIndex(a) > -1) return this.data.huoDongData[this.getHuoDongDataIndex(a)]
			},
			setHuoDongData: function(a) {
				this.getHuoDongDataIndex(a) > -1 && (this.data.huoDongData[this.getHuoDongDataIndex(a)]++, this.saveData())
			},
			checkSignHadShowToday: function() {
				this.signAutoShow = this.data.signHadShowTodayDate != Tools.getDateDayString()
			},
			getChengHaoEP: function() {
				return this.data.chengHaoEP
			},
			setChengHaoEP: function(a) {
				this.data.chengHaoEP += a, this.saveData()
			},
			getChengHaoLevel: function() {
				for (var a = -1, t = 0, e = 0; e < AD.chengHaoData.length; e++)
				if (t += AD.chengHaoData[e].Rank_Exp, this.data.chengHaoEP < t) {
					a = e - 1;
					break
				}
				return -1 == a && (a = AD.chengHaoData.length - 1), a
			},
			getChengHaoEPLevelNow: function() {
				for (var a, t = 0, e = 0; e < globalData.getChengHaoLevel() + 1; e++) t += AD.chengHaoData[e].Rank_Exp;
				if (a = this.data.chengHaoEP - t, globalData.getChengHaoLevel() + 1 < AD.chengHaoData.length) var n = a / (i = AD.chengHaoData[globalData.getChengHaoLevel() + 1].Rank_Exp);
				else {
					n = 1;
					var i = AD.chengHaoData[globalData.getChengHaoLevel()].Rank_Exp
				}
				return {
					EPNow: a,
					EPLevelNow: i,
					progress: n
				}
			},
			getGunCfg: function(a, t) {
				var e = AD.gunData[a],
					n = globalData.getGunLevel(a),
					i = AD.gunPriceData[a],
					o = null;
				switch (t) {
				case "伤害":
					o = e.Gun_Hurt + e.Gun_HurtUp * n;
					break;
				case "射速":
					o = e.Gun_Firerate - e.Gun_FirerateUp * n;
					break;
				case "子弹速度":
					o = e.Gun_Bulletrate;
					break;
				case "精准":
					o = e.Gun_Accurate - e.Gun_AccurateUp * n;
					break;
				case "弹夹数":
					o = e.Gun_Ammo + e.Gun_AmmoUp * n;
					break;
				case "暴击率":
					o = e.Gun_Hit;
					break;
				case "换弹速度":
					o = e.Gun_Reload - e.Gun_ReloadUp * n;
					break;
				case "攻击范围":
					o = e.Gun_Range + e.Gun_RangeUp * n;
					break;
				case "名称":
					o = i.Gun_Name;
					break;
				case "军衔等级限制":
					o = i.Gun_Firerate;
					break;
				case "解锁价格":
					o = i.Gun_Unlock;
					break;
				case "升级价格0":
					o = i.GunUp1_Gold;
					break;
				case "升级价格1":
					o = i.GunUp2_Gold;
					break;
				case "升级价格2":
					o = i.GunUp3_Gold;
					break;
				case "升级价格3":
					o = i.GunUp4_Gold;
					break;
				case "升级价格4":
					o = i.GunUp5_Gold
				}
				return o
			},
			getGunLevel: function(a) {
				return this.data.gunLevel[a]
			},
			setGunLevel: function(a) {
				this.data.gunLevel[a]++, this.data.gunLevel[a] >= 5 && globalData.setHuoDongData("金枪大师"), this.saveData()
			},
			getGunUnlockState: function(a) {
				return this.data.gunUnlockState[a]
			},
			setGunUnlockState: function(a) {
				for (var t = 0; t < this.data.gunUnlockState.length; t++) this.data.gunUnlockState[t] > 0 && (this.data.gunUnlockState[t] = 1);
				this.data.gunUnlockState[a] = 2, globalData.gunType = a, this.saveData()
			},
			getRoleUnlockState: function(a) {
				return this.data.roleUnlockState[a]
			},
			setRoleUnlockState: function(a) {
				for (var t = 0; t < this.data.roleUnlockState.length; t++) this.data.roleUnlockState[t] > 0 && (this.data.roleUnlockState[t] = 1);
				this.data.roleUnlockState[a] = 2, globalData.roleType = a, a >= 12 && cc.director.emit("解锁彩蛋角色", a), cc.director.emit("切换展示角色", a), this.saveData()
			},
			getSignData: function() {
				if (null == this.data.signData[0]) return !0;
				for (var a = 0; a < 7; a++)
				if (this.data.signData[a] == Tools.getDateDayString()) return !1;
				return !0
			},
			getSignDays: function() {
				for (var a = 0; a < 7; a++) {
					if (null != this.data.signData[6]) return 7;
					if (null == this.data.signData[a]) return a
				}
				return 0
			},
			resetSignData: function() {
				if (null != this.data.signData[6] && this.data.signData[6] != Tools.getDateDayString()) for (var a = 0; a < 7; a++) this.data.signData[a] = null
			},
			setSignData: function() {
				for (var a = 0; a < 7; a++)
				if (null == this.data.signData[a]) {
					this.data.signData[a] = Tools.getDateDayString();
					break
				}
				this.saveData()
			},
			getQiangHuaLine: function(a) {
				return this.data.qiangHuaLine[a]
			},
			setQiangHuaLine: function(a) {
				this.data.qiangHuaLine[this.data.qiangHuaLevel] = a, console.log("this.data.qiangHuaLine  " + this.data.qiangHuaLine), this.saveData()
			},
			getQiangHuaLineNextLevel: function() {
				if (0 == this.data.qiangHuaLevel) return [0];
				var a = this.data.qiangHuaLine[this.data.qiangHuaLevel - 1];
				if (3 == this.data.qiangHuaLevel || 5 == this.data.qiangHuaLevel) var t = [a - 1, a];
				else t = [a, a + 1];
				return t
			},
			getQiangHua: function(a) {
				var t = null;
				switch (a) {
				case "血量上限":
					t = this.data.qiangHuaObj.hpMax;
					break;
				case "移动速度":
					t = this.data.qiangHuaObj.moveSpeed;
					break;
				case "暴击率":
					t = this.data.qiangHuaObj.baoJiRate;
					break;
				case "复活时间":
					t = this.data.qiangHuaObj.reviveTime;
					break;
				case "无敌时间":
					t = this.data.qiangHuaObj.wuDiTime;
					break;
				case "伤害":
					t = this.data.qiangHuaObj.hurtRate;
					break;
				case "c4安装时间":
					t = this.data.qiangHuaObj.c4AnZhuangTime;
					break;
				case "c4拆除时间":
					t = this.data.qiangHuaObj.c4ChaiChuTime
				}
				if (null != t) return t;
				console.error("强化属性获取失败  " + a)
			},
			setQiangHua: function(a, t) {
				var e = !1;
				switch (a) {
				case "血量上限":
					this.data.qiangHuaObj.hpMax += t, e = !0;
					break;
				case "移动速度":
					this.data.qiangHuaObj.moveSpeed += t, e = !0;
					break;
				case "暴击率":
					this.data.qiangHuaObj.baoJiRate += t, e = !0;
					break;
				case "复活时间":
					this.data.qiangHuaObj.reviveTime += t, e = !0;
					break;
				case "无敌时间":
					this.data.qiangHuaObj.wuDiTime += t, e = !0;
					break;
				case "伤害":
					this.data.qiangHuaObj.hurtRate += t, e = !0;
					break;
				case "c4安装时间":
					this.data.qiangHuaObj.c4AnZhuangTime += t, e = !0;
					break;
				case "c4拆除时间":
					this.data.qiangHuaObj.c4ChaiChuTime += t, e = !0
				}
				return 0 == e && console.error("参数错误  setQiangHua"), this.saveData(), cc.director.emit("系统提示", a + " Update Successed"), !0
			},
			getQiangHuaLevel: function() {
				return this.data.qiangHuaLevel
			},
			setQiangHuaLevel: function() {
				return (arguments.length <= 0 ? void 0 : arguments[0]) ? (this.data.qiangHuaLevel = 0, this.data.qiangHuaNum = this.data.qiangHuaNumForever, setTimeout(function() {
					cc.director.emit("系统提示", "Skill Points Reset")
				}, 300)) : this.data.qiangHuaLevel += 1, cc.director.emit("强化等级变化"), cc.director.emit("强化点数量变化"), this.saveData(), !0
			},
			getQiangHuaNum: function() {
				return this.data.qiangHuaNum
			},
			setQiangHuaNum: function(a) {
				return this.data.qiangHuaNum + a >= 0 ? (this.data.qiangHuaNum += a, a > 0 && (this.data.qiangHuaNumForever += a), console.log("当前强化点  " + this.data.qiangHuaNum), cc.director.emit("强化点数量变化"), this.saveData(), !0) : (cc.director.emit("系统提示", "Need Points"), !1)
			},
			getCoinNum: function() {
				return this.data.coinNum
			},
			setCoinNum: function(a) {
				return this.data.coinNum + a >= 0 && (this.data.coinNum += a, cc.director.emit("金币数量变化"), this.saveData(), !0)
			},
			getDiamondNum: function() {
				return this.data.diamondNum
			},
			setDiamondNum: function(a) {
				return this.data.diamondNum + a >= 0 && (this.data.diamondNum += a, cc.director.emit("钻石数量变化"), this.saveData(), !0)
			},
			getDataAll: function() {
				this.clearDataNow && globalData.clearAllData(), cc.debug.setDisplayStats(!1), 1 != cc.sys.localStorage.getItem(globalData.keyFirst) ? (cc.sys.localStorage.setItem(globalData.keyFirst, 1), globalData.saveData(), cc.log("首次进入游戏"), globalData.data = globalData.getData()) : (cc.log("非首次进入游戏 " + cc.sys.localStorage.getItem(globalData.keyFirst)), globalData.data = globalData.getData());
				for (var a = 0; a < this.data.roleUnlockState.length; a++)
				if (2 == this.data.roleUnlockState[a]) {
					globalData.roleType = a;
					break
				}
				for (a = 0; a < this.data.gunUnlockState.length; a++)
				if (2 == this.data.gunUnlockState[a]) {
					globalData.gunType = a;
					break
				}
				this.resetSignData(), this.checkSignHadShowToday(), this.xianLiangRoleSecond = this.getXianLiangRoleSecond(), console.log(" // " + this.data.roleUnlockState), 16 == this.data.roleUnlockState.length && (this.data.roleUnlockState.push(0), this.data.roleUnlockState.push(0), this.data.roleUnlockState.push(0)), console.log(" ** " + this.data.roleUnlockState)
			},
			clearAllData: function() {
				cc.sys.localStorage.removeItem(globalData.keyFirst), cc.sys.localStorage.removeItem(globalData.keyData)
			},
			saveData: function() {
				cc.sys.localStorage.setItem(globalData.keyData, JSON.stringify(globalData.data))
			},
			getData: function() {
				var a = cc.sys.localStorage.getItem(globalData.keyData);
				if (cc.log("_res = " + a), null != a) return JSON.parse(a)
			},
			changeScene: function(a) {
				cc.director.emit("显示过场", a)
			}
		}, cc._RF.pop()
	}, {}]
}, {}, ["AD_4399", "globalData"]);