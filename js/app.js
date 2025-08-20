// データ管理クラス
class CalorieTracker {
  constructor() {
    this.menus = JSON.parse(localStorage.getItem("menus")) || [];
    this.meals = JSON.parse(localStorage.getItem("meals")) || [];
    this.goals = {
      daily: parseInt(localStorage.getItem("dailyGoal")) || 2000,
      userData: JSON.parse(localStorage.getItem("userData")) || null,
    };

    // ストレージ使用量を監視
    this.checkStorageUsage();
    // 既存mealsのmenuName/menuCalories補完
    this.meals.forEach((meal) => {
      if (
        meal.menuId &&
        (meal.menuName === undefined || meal.menuCalories === undefined)
      ) {
        const menu = this.menus.find((m) => m.id === meal.menuId);
        if (menu) {
          meal.menuName = menu.name;
          meal.menuCalories = menu.calories;
        }
      }
    });
    this.saveMeals();
  }

  // ストレージ使用量を計算して警告を表示
  checkStorageUsage() {
    const usage = {
      menus: new Blob([JSON.stringify(this.menus)]).size,
      meals: new Blob([JSON.stringify(this.meals)]).size,
      goals: new Blob([JSON.stringify(this.goals)]).size,
      total: 0,
    };
    usage.total = usage.menus + usage.meals + usage.goals;

    const limit = 5 * 1024 * 1024; // 5MB
    const usagePercentage = (usage.total / limit) * 100;

    return {
      usage,
      limit,
      isWarning: usagePercentage > 80,
      percentage: usagePercentage,
    };
  }

  // 古いデータを抽出（6ヶ月以上前）
  getOldData() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    return this.meals.filter((meal) => new Date(meal.date) < sixMonthsAgo);
  }

  // データをエクスポート
  exportData(data, filename) {
    const exportData = {
      data,
      exportedAt: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(exportData)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    return true;
  }

  // 古いデータを削除
  removeOldData() {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
    this.meals = this.meals.filter(
      (meal) => new Date(meal.date) >= sixMonthsAgo
    );
    this.saveMeals();
  }

  // インポートデータの検証
  validateImportData(data) {
    const validation = {
      isValid: true,
      details: {
        menus: data.menus && Array.isArray(data.menus),
        meals: data.meals && Array.isArray(data.meals),
        goals: data.goals && typeof data.goals.daily === "number",
      },
    };
    validation.isValid = Object.values(validation.details).some((v) => v);
    return validation;
  }

  // データのマージ
  mergeData(currentData, newData) {
    if (Array.isArray(currentData) && Array.isArray(newData)) {
      // IDの重複を避けつつマージ
      const merged = [...currentData];
      newData.forEach((item) => {
        if (!merged.find((existing) => existing.id === item.id)) {
          merged.push(item);
        }
      });
      return merged;
    }
    return newData;
  }

  // データのインポート
  async importData(
    file,
    options = { merge: false, types: { menus: true, meals: true, goals: true } }
  ) {
    try {
      const text = await file.text();
      const importedData = JSON.parse(text);

      if (!importedData.data || !importedData.exportedAt) {
        throw new Error("無効なインポートファイルです");
      }

      const data = importedData.data;
      const validation = this.validateImportData(data);

      if (!validation.isValid) {
        throw new Error("インポートデータの形式が正しくありません");
      }

      if (validation.details.menus && options.types.menus) {
        this.menus = options.merge
          ? this.mergeData(this.menus, data.menus)
          : data.menus;
        this.saveMenus();
      }

      if (validation.details.meals && options.types.meals) {
        this.meals = options.merge
          ? this.mergeData(this.meals, data.meals)
          : data.meals;
        this.saveMeals();
      }

      if (validation.details.goals && options.types.goals) {
        this.goals = options.merge
          ? { ...this.goals, ...data.goals }
          : data.goals;
        localStorage.setItem("dailyGoal", this.goals.daily);
      }

      return {
        success: true,
        importedData: {
          menus: validation.details.menus && options.types.menus,
          meals: validation.details.meals && options.types.meals,
          goals: validation.details.goals && options.types.goals,
        },
      };
    } catch (error) {
      console.error("データのインポートに失敗しました:", error);
      return { success: false, error: error.message };
    }
  }

  // メニュー関連のメソッド
  addMenu(name, calories) {
    const menu = {
      id: Date.now(),
      name,
      calories: parseInt(calories),
    };
    this.menus.push(menu);
    this.saveMenus();
    return menu;
  }

  deleteMenu(id) {
    this.menus = this.menus.filter((menu) => menu.id !== id);
    this.saveMenus();
  }

  saveMenus() {
    localStorage.setItem("menus", JSON.stringify(this.menus));
  }

  // 食事関連のメソッド
  addMeal(date, menuId, customName = null, customCalories = null) {
    let meal;
    if (menuId) {
      // メニュー選択時はname/caloriesもコピー
      const menu = this.menus.find((m) => m.id === menuId);
      meal = {
        id: Date.now(),
        date,
        menuId,
        menuName: menu ? menu.name : null,
        menuCalories: menu ? menu.calories : null,
        customName: null,
        customCalories: null,
      };
    } else {
      // カスタム入力時
      meal = {
        id: Date.now(),
        date,
        menuId: null,
        menuName: null,
        menuCalories: null,
        customName,
        customCalories: customCalories ? parseInt(customCalories) : null,
      };
    }
    this.meals.push(meal);
    this.saveMeals();
    return meal;
  }

  deleteMeal(id) {
    this.meals = this.meals.filter((meal) => meal.id !== id);
    this.saveMeals();
  }

  saveMeals() {
    localStorage.setItem("meals", JSON.stringify(this.meals));
  }

  // 目標設定のメソッド
  saveGoals(daily, userData = null) {
    this.goals.daily = parseInt(daily);
    localStorage.setItem("dailyGoal", daily);

    if (userData) {
      this.goals.userData = userData;
      localStorage.setItem("userData", JSON.stringify(userData));
    }
  }

  // 基礎代謝を計算（ハリス・ベネディクト方程式）
  calculateBMR(weight) {
    // 男性の場合の計算式を使用（より多めのカロリーを目標とするため）
    return 13.397 * weight + 466.7;
  }

  // 1日の必要カロリーを計算
  calculateRequiredCalories(age, currentWeight, targetWeight, activityLevel) {
    // 基礎代謝を計算
    const bmr = this.calculateBMR(currentWeight);

    // 1kgの増量に必要なカロリー = 7000kcal
    const weightGainCalories = (targetWeight * 7000) / 30; // 30日で割って1日あたりの追加必要カロリー

    // 活動レベルを考慮した維持カロリー
    const maintenanceCalories = bmr * parseFloat(activityLevel);

    // 合計必要カロリー（維持カロリー + 増量に必要な追加カロリー）
    return Math.round(maintenanceCalories + weightGainCalories);
  }

  getGoalForPeriod(period, targetDate = new Date()) {
    const dailyGoal = this.goals.daily;

    switch (period) {
      case "daily":
        return dailyGoal;
      case "weekly":
        return dailyGoal * 7;
      case "monthly":
        const daysInMonth = new Date(
          targetDate.getFullYear(),
          targetDate.getMonth() + 1,
          0
        ).getDate();
        return dailyGoal * daysInMonth;
      default:
        return dailyGoal;
    }
  }

  // 統計計算メソッド
  calculateStats(period, targetDate = new Date()) {
    const stats = {
      total: 0,
      goal: 0,
      difference: 0,
      startDate: new Date(targetDate),
      endDate: new Date(targetDate),
      prediction: 0,
      elapsedRatio: 0,
    };

    // 経過時間の計算
    const now = new Date();

    switch (period) {
      case "daily":
        stats.startDate = new Date(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          targetDate.getDate()
        );
        stats.endDate = new Date(stats.startDate);
        stats.endDate.setDate(stats.endDate.getDate() + 1);
        stats.total = this.calculateDailyCalories(targetDate);
        stats.goal = this.getGoalForPeriod(period, targetDate);
        break;
      case "weekly":
        stats.startDate = new Date(targetDate);
        stats.startDate.setDate(
          stats.startDate.getDate() - stats.startDate.getDay()
        );
        stats.endDate = new Date(stats.startDate);
        stats.endDate.setDate(stats.endDate.getDate() + 7);
        stats.total = this.calculateWeeklyCalories(targetDate);
        stats.goal = this.getGoalForPeriod(period, targetDate);
        break;
      case "monthly":
        stats.startDate = new Date(
          targetDate.getFullYear(),
          targetDate.getMonth(),
          1
        );
        stats.endDate = new Date(
          targetDate.getFullYear(),
          targetDate.getMonth() + 1,
          0
        );
        stats.total = this.calculateMonthlyCalories(targetDate);
        stats.goal = this.getGoalForPeriod(period, targetDate);
        break;
    }

    stats.difference = stats.goal - stats.total;

    // 経過時間の比率を計算
    const totalMs = stats.endDate.getTime() - stats.startDate.getTime();
    const elapsedMs = Math.min(
      now.getTime() - stats.startDate.getTime(),
      totalMs
    );
    stats.elapsedRatio = elapsedMs / totalMs;

    // 予測値を計算（日次は除外）
    if (period !== "daily" && stats.elapsedRatio > 0) {
      stats.prediction = Math.round(stats.total / stats.elapsedRatio);
    }

    return stats;
  }

  calculateDailyCalories(date) {
    const dayStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate()
    );
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    return this.calculateCaloriesForDateRange(dayStart, dayEnd);
  }

  calculateWeeklyCalories(date) {
    const weekStart = new Date(date);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    return this.calculateCaloriesForDateRange(weekStart, weekEnd);
  }

  calculateMonthlyCalories(date) {
    const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

    return this.calculateCaloriesForDateRange(monthStart, monthEnd);
  }

  calculateCaloriesForDateRange(start, end) {
    return this.meals.reduce((total, meal) => {
      const mealDate = new Date(meal.date);
      if (mealDate >= start && mealDate < end) {
        if (meal.customCalories !== null) {
          return total + meal.customCalories;
        } else if (meal.menuCalories !== null) {
          return total + meal.menuCalories;
        } else {
          // 旧データ互換
          const menu = this.menus.find((m) => m.id === meal.menuId);
          return total + (menu ? menu.calories : 0);
        }
      }
      return total;
    }, 0);
  }
}

// UIコントローラークラス
class UIController {
  constructor() {
    this.tracker = new CalorieTracker();
    this.currentDate = new Date();
    this.addDataManagementControls(); // データ管理UIを先に追加
    this.initializeEventListeners(); // その後でイベントリスナーを設定
    this.showSection("menuManager");
    this.updateMenuList();
    this.updateMealList();
  }

  // データ管理用のUIを追加
  addDataManagementControls() {
    const header = document.querySelector("header nav");

    // データ管理ボタンを追加
    const dataManageBtn = document.createElement("button");
    dataManageBtn.id = "showDataManage";
    dataManageBtn.textContent = "データ管理";
    header.appendChild(dataManageBtn);

    // データ管理セクションを追加
    const main = document.querySelector("main");
    const dataManageSection = document.createElement("section");
    dataManageSection.id = "dataManage";
    dataManageSection.className = "section";
    dataManageSection.innerHTML = `
      <h2>データ管理</h2>
      <div class="data-management">
        <div class="storage-info">
          <h3>ストレージ使用状況</h3>
          <div id="storageUsage"></div>
        </div>
        <div class="data-actions">
          <h3>データのエクスポート/インポート</h3>
          <button id="exportAllData">全データのエクスポート</button>
          <div class="import-container">
            <input type="file" id="importData" accept=".json" style="display: none;">
            <button id="importDataBtn">データのインポート</button>
          </div>
          <div id="archiveSection" style="display: none;">
            <h3>古いデータのアーカイブ</h3>
            <p>6ヶ月以上前のデータが見つかりました。アーカイブしますか？</p>
            <button id="archiveOldData">アーカイブを作成</button>
          </div>
        </div>
      </div>
    `;
    main.appendChild(dataManageSection);

    this.initializeDataManagementListeners();
  }

  // データ管理のイベントリスナーを設定
  initializeDataManagementListeners() {
    // 全データのエクスポート
    document.getElementById("exportAllData").addEventListener("click", () => {
      const allData = {
        menus: this.tracker.menus,
        meals: this.tracker.meals,
        goals: this.tracker.goals,
      };
      this.tracker.exportData(
        allData,
        `calorie-tracker-all-${new Date().toISOString().split("T")[0]}.json`
      );
    });

    // データのインポート
    document.getElementById("importDataBtn").addEventListener("click", () => {
      document.getElementById("importData").click();
    });

    document
      .getElementById("importData")
      .addEventListener("change", async (e) => {
        if (e.target.files.length > 0) {
          const file = e.target.files[0];

          // インポート設定の確認
          const importOptions = {
            merge: confirm(
              "既存のデータとマージしますか？\n「いいえ」を選択すると上書きされます。"
            ),
            types: {
              menus: confirm("メニューデータをインポートしますか？"),
              meals: confirm("食事データをインポートしますか？"),
              goals: confirm("目標設定をインポートしますか？"),
            },
          };

          const result = await this.tracker.importData(file, importOptions);

          if (result.success) {
            let message =
              "インポートが完了しました\n\nインポートされたデータ:\n";
            if (result.importedData.menus) message += "- メニューデータ\n";
            if (result.importedData.meals) message += "- 食事データ\n";
            if (result.importedData.goals) message += "- 目標設定\n";
            alert(message);

            this.updateMenuList();
            this.updateMealList();
            this.updateStorageUsage();
          } else {
            alert(`インポートに失敗しました: ${result.error}`);
          }
        }
      });

    // 古いデータのアーカイブ
    document.getElementById("archiveOldData").addEventListener("click", () => {
      const oldData = this.tracker.getOldData();
      if (oldData.length > 0) {
        const success = this.tracker.exportData(
          { meals: oldData },
          `calorie-tracker-archive-${
            new Date().toISOString().split("T")[0]
          }.json`
        );

        if (
          success &&
          confirm(
            "古いデータをエクスポートしました。\nローカルストレージから削除してもよろしいですか？"
          )
        ) {
          this.tracker.removeOldData();
          this.updateMealList();
          this.updateStorageUsage();
          alert("古いデータを削除しました");
        }
      }
    });

    // 定期的なストレージ使用量の更新
    this.updateStorageUsage();
    setInterval(() => this.updateStorageUsage(), 60000); // 1分ごとに更新
  }

  // ストレージ使用状況の表示を更新
  updateStorageUsage() {
    const storageStatus = this.tracker.checkStorageUsage();
    const storageUsage = document.getElementById("storageUsage");
    if (storageUsage) {
      storageUsage.innerHTML = `
        <p>使用量: ${Math.round(
          storageStatus.usage.total / 1024
        )}KB / ${Math.round(storageStatus.limit / 1024)}KB (${Math.round(
        storageStatus.percentage
      )}%)</p>
        <p>内訳:</p>
        <ul>
          <li>メニューデータ: ${Math.round(
            storageStatus.usage.menus / 1024
          )}KB</li>
          <li>食事データ: ${Math.round(storageStatus.usage.meals / 1024)}KB</li>
        </ul>
      `;

      // 警告表示の更新
      const archiveSection = document.getElementById("archiveSection");
      const oldData = this.tracker.getOldData();
      if (storageStatus.isWarning && oldData.length > 0) {
        archiveSection.style.display = "block";
      } else {
        archiveSection.style.display = "none";
      }
    }
  }

  initializeEventListeners() {
    // カロリー計算機のイベントリスナー
    document
      .getElementById("calculateCalories")
      .addEventListener("click", () => {
        this.calculateRequiredCalories();
      });

    // データ管理ボタン
    const dataManageBtn = document.getElementById("showDataManage");
    if (dataManageBtn) {
      dataManageBtn.addEventListener("click", () => {
        this.showSection("dataManage");
      });
    }

    // その他のナビゲーションボタン
    document.querySelectorAll("nav button").forEach((button) => {
      if (button.id !== "showDataManage") {
        // データ管理ボタンは除外
        button.addEventListener("click", () => {
          const sectionId = button.id.replace("show", "");
          this.showSection(
            sectionId.charAt(0).toLowerCase() + sectionId.slice(1)
          );
        });
      }
    });

    // メニュー管理
    document
      .getElementById("addMenu")
      .addEventListener("click", () => this.handleAddMenu());
    document.getElementById("menuList").addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-menu")) {
        this.handleDeleteMenu(e.target.dataset.id);
      }
    });

    // 食事登録
    document
      .getElementById("addMeal")
      .addEventListener("click", () => this.handleAddMeal());
    document.getElementById("mealList").addEventListener("click", (e) => {
      if (e.target.classList.contains("delete-meal")) {
        this.handleDeleteMeal(e.target.dataset.id);
      }
    });

    // 目標設定
    document
      .getElementById("saveGoals")
      .addEventListener("click", () => this.handleSaveGoals());

    // 統計
    document.getElementById("statsPeriod").addEventListener("change", (e) => {
      this.updateStats(e.target.value);
    });

    // 日付コントロール
    document
      .getElementById("prevDate")
      .addEventListener("click", () => this.changeDate("prev"));
    document
      .getElementById("nextDate")
      .addEventListener("click", () => this.changeDate("next"));
    document
      .getElementById("todayDate")
      .addEventListener("click", () => this.goToToday());
  }

  showSection(sectionId) {
    // セクションの表示/非表示を切り替え
    document.querySelectorAll(".section").forEach((section) => {
      section.style.display = "none";
    });
    document.getElementById(sectionId).style.display = "block";

    // ナビゲーションボタンのアクティブ状態を更新
    document.querySelectorAll("nav button").forEach((button) => {
      button.classList.remove("active");
    });

    // 対応するボタンをアクティブにする
    const targetButtonId =
      "show" + sectionId.charAt(0).toUpperCase() + sectionId.slice(1);
    const activeButton = document.getElementById(targetButtonId);
    if (activeButton) {
      activeButton.classList.add("active");
    }

    if (sectionId === "mealEntry") {
      this.updateMenuSelect();
      // 日付フィールドのデフォルト値を当日に設定
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      document.getElementById("mealDate").value = `${yyyy}-${mm}-${dd}`;
    } else if (sectionId === "stats") {
      this.updateStats("daily");
    } else if (sectionId === "goals") {
      // 目標設定画面を開いたときに現在の設定値を表示
      document.getElementById("dailyGoal").value = this.tracker.goals.daily;

      // 保存されているユーザーデータがあれば復元
      if (this.tracker.goals.userData) {
        const userData = this.tracker.goals.userData;
        document.getElementById("userAge").value = userData.age || "";
        document.getElementById("currentWeight").value =
          userData.currentWeight || "";
        document.getElementById("targetWeight").value =
          userData.targetWeight || "";
        document.getElementById("activityLevel").value =
          userData.activityLevel || "1.2";
      }
    }
  }

  // メニュー管理UI
  handleAddMenu() {
    const nameInput = document.getElementById("menuName");
    const caloriesInput = document.getElementById("menuCalories");

    if (nameInput.value && caloriesInput.value) {
      this.tracker.addMenu(nameInput.value, caloriesInput.value);
      this.updateMenuList();
      nameInput.value = "";
      caloriesInput.value = "";
    }
  }

  handleDeleteMenu(id) {
    this.tracker.deleteMenu(parseInt(id));
    this.updateMenuList();
    this.updateMenuSelect();
  }

  updateMenuList() {
    const menuList = document.getElementById("menuList");
    menuList.innerHTML = this.tracker.menus
      .map(
        (menu) => `
            <div class="list-item">
                <span>${menu.name} (${menu.calories}kcal)</span>
                <button class="delete-menu" data-id="${menu.id}">削除</button>
            </div>
        `
      )
      .join("");
  }

  // 食事登録UI
  updateMenuSelect() {
    const select = document.getElementById("mealMenu");

    // イベントリスナーを一旦削除
    const oldSelect = select.cloneNode(true);
    select.parentNode.replaceChild(oldSelect, select);

    // セレクトの内容を更新
    oldSelect.innerHTML =
      '<option value="">メニューを選択</option>' +
      this.tracker.menus
        .map(
          (menu) =>
            `<option value="${menu.id}">${menu.name} (${menu.calories}kcal)</option>`
        )
        .join("");

    // メニュー選択時のイベントリスナーを追加
    oldSelect.addEventListener("change", (e) => {
      const customNameInput = document.getElementById("customMealName");
      const customCaloriesInput = document.getElementById("customMealCalories");

      if (e.target.value) {
        // メニューが選択された場合
        const selectedMenu = this.tracker.menus.find(
          (menu) => menu.id === parseInt(e.target.value)
        );
        if (selectedMenu) {
          customNameInput.value = selectedMenu.name;
          customCaloriesInput.value = selectedMenu.calories;
          // カスタムフィールドを読み取り専用に
          customNameInput.readOnly = true;
          customCaloriesInput.readOnly = true;
        }
      } else {
        // メニュー未選択の場合
        customNameInput.value = "";
        customCaloriesInput.value = "";
        // カスタムフィールドを編集可能に
        customNameInput.readOnly = false;
        customCaloriesInput.readOnly = false;
      }
    });
  }

  handleAddMeal() {
    const date = document.getElementById("mealDate").value;
    const menuId = document.getElementById("mealMenu").value;
    const customName = document.getElementById("customMealName").value;
    const customCalories = document.getElementById("customMealCalories").value;

    if (!date) {
      alert("日付を選択してください");
      return;
    }

    if (menuId) {
      // メニューが選択されている場合
      this.tracker.addMeal(date, parseInt(menuId), null, null);
    } else if (customName && customCalories) {
      // カスタム入力の場合
      this.tracker.addMeal(date, null, customName, customCalories);
    } else {
      alert("メニューを選択するか、カスタムメニューを入力してください");
      return;
    }

    // フォームをリセット
    document.getElementById("mealMenu").value = "";
    document.getElementById("customMealName").value = "";
    document.getElementById("customMealCalories").value = "";
    document.getElementById("customMealName").readOnly = false;
    document.getElementById("customMealCalories").readOnly = false;

    this.updateMealList();
  }

  handleDeleteMeal(id) {
    this.tracker.deleteMeal(parseInt(id));
    this.updateMealList();
    this.updateStats(document.getElementById("statsPeriod").value);
  }

  updateMealList() {
    const mealList = document.getElementById("mealList");
    mealList.innerHTML = this.tracker.meals
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .map((meal) => {
        let name, calories;
        if (meal.customName) {
          name = meal.customName;
          calories = meal.customCalories;
        } else if (meal.menuName && meal.menuCalories !== null) {
          name = meal.menuName;
          calories = meal.menuCalories;
        } else {
          const menu = this.tracker.menus.find((m) => m.id === meal.menuId);
          name = menu ? menu.name : "不明なメニュー";
          calories = menu ? menu.calories : 0;
        }
        return `
                    <div class="list-item">
                        <span>${meal.date}: ${name} (${calories}kcal)</span>
                        <button class="delete-meal" data-id="${meal.id}">削除</button>
                    </div>
                `;
      })
      .join("");
  }

  // 目標設定UI
  handleSaveGoals() {
    const daily = document.getElementById("dailyGoal").value;
    const userData = {
      age: document.getElementById("userAge").value,
      currentWeight: document.getElementById("currentWeight").value,
      targetWeight: document.getElementById("targetWeight").value,
      activityLevel: document.getElementById("activityLevel").value,
    };

    if (daily) {
      this.tracker.saveGoals(daily, userData);
      this.updateStats(document.getElementById("statsPeriod").value);
      alert("目標カロリーを保存しました。");
    }
  }

  // カロリー計算処理
  calculateRequiredCalories() {
    const age = document.getElementById("userAge").value;
    const currentWeight = document.getElementById("currentWeight").value;
    const targetWeight = document.getElementById("targetWeight").value;
    const activityLevel = document.getElementById("activityLevel").value;

    if (!age || !currentWeight || !targetWeight || !activityLevel) {
      alert("すべての項目を入力してください。");
      return;
    }

    const calories = this.tracker.calculateRequiredCalories(
      parseFloat(age),
      parseFloat(currentWeight),
      parseFloat(targetWeight),
      activityLevel
    );

    // 計算結果を目標カロリーに設定
    document.getElementById("dailyGoal").value = calories;

    // 結果の説明を表示
    const explanation = `
      1日の推奨カロリー: ${calories}kcal
      ・基礎代謝: ${Math.round(this.tracker.calculateBMR(currentWeight))}kcal
      ・維持カロリー: ${Math.round(
        this.tracker.calculateBMR(currentWeight) * parseFloat(activityLevel)
      )}kcal
      ・増量のための追加カロリー: ${Math.round(
        (targetWeight * 7000) / 30
      )}kcal/日
      
      ※${targetWeight}kgの増量には約${Math.round(
      targetWeight * 7000
    )}kcalが必要です
    `;

    alert(explanation);
  }

  // 日付管理
  changeDate(direction) {
    const period = document.getElementById("statsPeriod").value;

    switch (period) {
      case "daily":
        if (direction === "prev") {
          this.currentDate.setDate(this.currentDate.getDate() - 1);
        } else {
          this.currentDate.setDate(this.currentDate.getDate() + 1);
        }
        break;
      case "weekly":
        if (direction === "prev") {
          this.currentDate.setDate(this.currentDate.getDate() - 7);
        } else {
          this.currentDate.setDate(this.currentDate.getDate() + 7);
        }
        break;
      case "monthly":
        if (direction === "prev") {
          this.currentDate.setMonth(this.currentDate.getMonth() - 1);
        } else {
          this.currentDate.setMonth(this.currentDate.getMonth() + 1);
        }
        break;
    }

    this.updateStats(period);
  }

  goToToday() {
    this.currentDate = new Date();
    this.updateStats(document.getElementById("statsPeriod").value);
  }

  // 統計UI
  updateStats(period) {
    const stats = this.tracker.calculateStats(period, this.currentDate);
    const statsDisplay = document.getElementById("statsDisplay");
    const currentDate = document.getElementById("currentDate");

    // 日付表示の更新
    currentDate.textContent = this.formatDateRange(
      stats.startDate,
      stats.endDate
    );

    const percentage = (stats.total / stats.goal) * 100;
    const predictionPercentage = stats.prediction
      ? (stats.prediction / stats.goal) * 100
      : 0;
    let message;
    let color;
    let predictionMessage = "";

    if (percentage > 100) {
      message = "素晴らしい！目標を超えました！";
      color = "#e74c3c";
    } else if (percentage >= 90) {
      message = "あと少し！がんばって！";
      color = "#f39c12";
    } else if (percentage >= 50) {
      message = "まだまだいけます！";
      color = "#f39c12";
    } else {
      message = "もっと食べましょう！";
      color = "#f39c12";
    }

    // 週次・月次の場合は予測を表示
    if (period !== "daily" && stats.elapsedRatio > 0) {
      const progress = Math.round(stats.elapsedRatio * 100);
      const daysLeft =
        period === "weekly"
          ? 7 - Math.floor(stats.elapsedRatio * 7)
          : new Date(stats.endDate).getDate() - new Date().getDate();

      let predictionStatusMessage;
      let predictionColor;

      if (predictionPercentage > 100) {
        predictionStatusMessage = "その調子！このペースなら目標達成できます！";
        predictionColor = "#e74c3c";
      } else if (predictionPercentage >= 90) {
        predictionStatusMessage = "あと一息！目標達成まであと少し！";
        predictionColor = "#f39c12";
      } else if (predictionPercentage >= 50) {
        predictionStatusMessage = "目標達成にはペースアップが必要です！";
        predictionColor = "#f39c12";
      } else {
        predictionStatusMessage = "このままだと目標達成は厳しそうです...";
        predictionColor = "#f39c12";
      }

      predictionMessage = `
        <div class="prediction" style="margin-top: 15px; padding: 10px; background: #f8f9fa; border-radius: 5px;">
          <h4 style="margin: 0 0 10px 0;">予測情報</h4>
          <p style="margin: 5px 0;">期間経過: ${progress}% (残り${daysLeft}日)</p>
          <p style="margin: 5px 0;">予測着地: ${
            stats.prediction
          }kcal (目標比${Math.round(predictionPercentage)}%)</p>
          <p style="margin: 5px 0; color: ${predictionColor}">
            ${predictionStatusMessage}
          </p>
        </div>
      `;
    }

    statsDisplay.innerHTML = `
            <div>
                <h3>${this.getPeriodLabel(period)}の統計</h3>
                <p>目標カロリー: ${stats.goal}kcal</p>
                <p>摂取カロリー: ${stats.total}kcal (${Math.round(
      percentage
    )}%)</p>
                ${
                  period === "daily"
                    ? `
                    <p style="color: ${color}">
                        ${message}<br>
                        ${
                          percentage > 100 ? "目標より" : "目標まで"
                        }: ${Math.abs(stats.difference)}kcal
                    </p>
                `
                    : `
                    <p>${
                      percentage > 100 ? "目標より" : "目標まで"
                    }: ${Math.abs(stats.difference)}kcal</p>
                `
                }
                ${predictionMessage}
            </div>
        `;
  }

  formatDateRange(startDate, endDate) {
    const options = { year: "numeric", month: "2-digit", day: "2-digit" };
    if (startDate.getTime() === endDate.getTime() - 86400000) {
      // 1日の場合
      return startDate.toLocaleDateString("ja-JP", options);
    }
    return `${startDate.toLocaleDateString("ja-JP", options)} ～ ${new Date(
      endDate.getTime() - 86400000
    ).toLocaleDateString("ja-JP", options)}`;
  }

  getPeriodLabel(period) {
    const isToday = this.isCurrentPeriod(period);
    switch (period) {
      case "daily":
        return isToday ? "本日" : "選択日";
      case "weekly":
        return isToday ? "今週" : "選択週";
      case "monthly":
        return isToday ? "今月" : "選択月";
      default:
        return "";
    }
  }

  isCurrentPeriod(period) {
    const now = new Date();
    const current = this.currentDate;

    switch (period) {
      case "daily":
        return now.toDateString() === current.toDateString();
      case "weekly":
        const nowWeek = new Date(
          now.getFullYear(),
          now.getMonth(),
          now.getDate() - now.getDay()
        );
        const currentWeek = new Date(
          current.getFullYear(),
          current.getMonth(),
          current.getDate() - current.getDay()
        );
        return nowWeek.toDateString() === currentWeek.toDateString();
      case "monthly":
        return (
          now.getFullYear() === current.getFullYear() &&
          now.getMonth() === current.getMonth()
        );
      default:
        return false;
    }
  }
}

// アプリケーションの初期化
document.addEventListener("DOMContentLoaded", () => {
  new UIController();
});
