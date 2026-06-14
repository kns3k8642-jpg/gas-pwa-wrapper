/**
 * レシピ参照PWAアプリ - GAS APIバックエンド
 * 
 * [セットアップ手順]
 * 1. 新規のスプレッドシートを作成します。
 * 2. 「拡張機能」 > 「Apps Script」を開きます。
 * 3. 本コードを「コード.gs」に貼り付けます。
 * 4. プロジェクトの設定（歯車マーク）を開き、「スクリプトプロパティ」に以下を追加します。
 *    - APP_ACCESS_CODE : アプリ入場用の共通アクセスコード (例: myrecipe123)
 *    - ADMIN_PIN       : 管理画面用の暗証番号 (例: 9999)
 *    - GEMINI_API_KEY  : Gemini APIのAPIキー
 *    - DRIVE_FOLDER_ID : Googleドライブの親フォルダID (省略時はマイドライブ直下に自動作成)
 * 5. エディタで「setupSpreadsheet」関数を選択して実行し、権限を承認します。
 * 6. 「デプロイ」 > 「新しいデプロイ」から「ウェブアプリ」としてデプロイします。
 *    - 次のユーザーとして実行: 自分
 *    - アクセスできるユーザー: 全員
 * 7. 発行された「ウェブアプリURL」を、recipe.html の API_URL に設定します。
 */

// Web APIのメインエントリポイント (CORS対応のためPOSTのみ受け付け)
function doPost(e) {
  const result = { success: false, error: '' };
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('Request body is empty');
    }
    
    const requestData = JSON.parse(e.postData.contents);
    const action = requestData.action;
    const accessCode = requestData.accessCode;
    const userIdHash = requestData.userIdHash;
    const payload = requestData.payload || {};

    // 1. アクセスコードの検証 (共通入場チェック)
    const props = PropertiesService.getScriptProperties();
    const serverAccessCode = props.getProperty('APP_ACCESS_CODE');
    if (!serverAccessCode || accessCode !== serverAccessCode) {
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'Invalid access code'
      })).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. アクションの分岐処理
    let data = null;
    switch (action) {
      case 'getBootstrap':
        data = getBootstrapData();
        break;
      case 'getUserState':
        data = getUserStateData(userIdHash);
        break;
      case 'saveUserState':
        data = saveUserStateData(userIdHash, payload);
        break;
      case 'uploadRecipeImage':
        verifyAdminPin(payload.adminPin);
        data = uploadRecipeImage(payload);
        break;
      case 'parseRecipeWithGemini':
        verifyAdminPin(payload.adminPin);
        data = parseRecipeWithGemini(payload);
        break;
      case 'saveRecipeDraft':
        verifyAdminPin(payload.adminPin);
        data = saveRecipeDraft(payload);
        break;
      case 'publishRecipeDraft':
        verifyAdminPin(payload.adminPin);
        data = publishRecipeDraft(payload);
        break;
      case 'backupSpreadsheet':
        verifyAdminPin(payload.adminPin);
        data = backupSpreadsheet();
        break;
      default:
        throw new Error('Unknown action: ' + action);
    }

    result.success = true;
    result.data = data;

  } catch (err) {
    result.success = false;
    result.error = err.message || err.toString();
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// 管理者PINの検証
function verifyAdminPin(pin) {
  const props = PropertiesService.getScriptProperties();
  const adminPin = props.getProperty('ADMIN_PIN');
  if (!adminPin || pin !== adminPin) {
    throw new Error('Invalid Admin PIN');
  }
}

// -------------------------------------------------------------
// 1. スプレッドシート自動セットアップ (初回のみ手動実行)
// -------------------------------------------------------------
function setupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const sheetsConfig = {
    'Recipes': [
      'recipeId', 'title', 'summary', 'category', 'genre', 
      'equipmentIdsJson', 'cookingMethodsJson', 'ingredientKeywordsJson', 
      'timeMin', 'difficulty', 'tagsJson', 'servings', 
      'ingredientsJson', 'stepsJson', 'notes', 
      'imageFileId', 'thumbnailFileId', 'imageUrl', 'thumbnailUrl', 
      'source', 'status', 'createdAt', 'updatedAt'
    ],
    'UserState': [
      'userIdHash', 'displayName', 'favoriteRecipeIdsJson', 
      'favoriteEquipmentIdsJson', 'defaultFiltersJson', 
      'recentViewsJson', 'recentSearchesJson', 'lastLoginAt', 
      'createdAt', 'updatedAt'
    ],
    'Equipment': [
      'equipmentId', 'name', 'maker', 'type', 'displayOrder', 'isActive', 'memo'
    ],
    'RecipeDrafts': [
      'draftId', 'rawImageFileId', 'parsedJson', 'sourceText', 
      'validationErrorsJson', 'status', 'publishedRecipeId', 
      'createdByHash', 'createdAt', 'updatedAt'
    ],
    'AppConfig': [
      'key', 'value', 'memo'
    ]
  };

  for (let sheetName in sheetsConfig) {
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
    }
    sheet.clear();
    sheet.getRange(1, 1, 1, sheetsConfig[sheetName].length)
      .setValues([sheetsConfig[sheetName]])
      .setFontWeight('bold')
      .setBackground('#f3f4f6');
    sheet.setFrozenRows(1);
  }

  // 調理機器のデフォルト初期データを挿入
  const equipSheet = ss.getSheetByName('Equipment');
  const equipData = [
    ['rakucooker_pro', 'ラクラクッカープロ', 'T-fal', '電気圧力鍋', 1, true, 'メインの電気圧力鍋'],
    ['hotcook', 'ホットクック', 'SHARP', '自動調理鍋', 2, true, '無水調理用の自動調理鍋'],
    ['bistro', 'ビストロ', 'Panasonic', 'オーブンレンジ', 3, true, '高機能オーブンレンジ'],
    ['frying_pan', 'フライパン', '', '汎用調理器具', 4, true, ''],
    ['pot', '鍋', '', '汎用調理器具', 5, true, ''],
    ['microwave', '電子レンジ', '', '汎用調理器具', 6, true, '']
  ];
  equipSheet.getRange(2, 1, equipData.length, equipData[0].length).setValues(equipData);

  Logger.log('Spreadsheet setup completed successfully.');
}

// -------------------------------------------------------------
// 2. APIロジックの実装
// -------------------------------------------------------------

// シートデータをオブジェクト配列に変換する汎用ヘルパー
function getSheetDataAsObjects(sheetName) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) return [];
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return [];
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const values = sheet.getRange(2, 1, lastRow - 1, sheet.getLastColumn()).getValues();
  
  return values.map(row => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index];
    });
    return obj;
  });
}

// 起動用初期データ取得
function getBootstrapData() {
  const recipes = getSheetDataAsObjects('Recipes').filter(r => r.status === 'published');
  const equipment = getSheetDataAsObjects('Equipment').filter(e => e.isActive === true || e.isActive === 'TRUE' || e.isActive === 1);
  
  // カテゴリ、ジャンル、タグのユニークリストを作成
  const categories = [...new Set(recipes.map(r => r.category).filter(Boolean))];
  const genres = [...new Set(recipes.map(r => r.genre).filter(Boolean))];
  
  const tagSet = new Set();
  recipes.forEach(r => {
    if (r.tagsJson) {
      try {
        const tags = JSON.parse(r.tagsJson);
        if (Array.isArray(tags)) {
          tags.forEach(t => tagSet.add(t));
        }
      } catch (e) {}
    }
  });

  return {
    recipes: recipes,
    equipment: equipment,
    categories: categories,
    genres: genres,
    tags: Array.from(tagSet),
    serverTime: new Date().toISOString()
  };
}

// ユーザー状態の取得
function getUserStateData(userIdHash) {
  if (!userIdHash) throw new Error('userIdHash is required');
  const states = getSheetDataAsObjects('UserState');
  const userState = states.find(s => s.userIdHash === userIdHash);
  
  if (userState) {
    return {
      userIdHash: userState.userIdHash,
      displayName: userState.displayName,
      favoriteRecipeIds: userState.favoriteRecipeIdsJson ? JSON.parse(userState.favoriteRecipeIdsJson) : [],
      favoriteEquipmentIds: userState.favoriteEquipmentIdsJson ? JSON.parse(userState.favoriteEquipmentIdsJson) : [],
      defaultFilters: userState.defaultFiltersJson ? JSON.parse(userState.defaultFiltersJson) : {},
      recentViews: userState.recentViewsJson ? JSON.parse(userState.recentViewsJson) : [],
      recentSearches: userState.recentSearchesJson ? JSON.parse(userState.recentSearchesJson) : []
    };
  }
  
  // 見つからない場合はデフォルト空データを返す
  return {
    userIdHash: userIdHash,
    displayName: '',
    favoriteRecipeIds: [],
    favoriteEquipmentIds: [],
    defaultFilters: {},
    recentViews: [],
    recentSearches: []
  };
}

// ユーザー状態の保存
function saveUserStateData(userIdHash, payload) {
  if (!userIdHash) throw new Error('userIdHash is required');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('UserState');
  const states = getSheetDataAsObjects('UserState');
  
  const rowIndex = states.findIndex(s => s.userIdHash === userIdHash);
  const now = new Date();
  
  const favoriteRecipeIdsJson = JSON.stringify(payload.favoriteRecipeIds || []);
  const favoriteEquipmentIdsJson = JSON.stringify(payload.favoriteEquipmentIds || []);
  const defaultFiltersJson = JSON.stringify(payload.defaultFilters || {});
  const recentViewsJson = JSON.stringify(payload.recentViews || []);
  const recentSearchesJson = JSON.stringify(payload.recentSearches || []);
  const displayName = payload.displayName || '';

  if (rowIndex >= 0) {
    // 既存行を更新 (1行目はヘッダー、findIndexの結果は0始まりなので rowは rowIndex + 2)
    const row = rowIndex + 2;
    sheet.getRange(row, 2).setValue(displayName);
    sheet.getRange(row, 3).setValue(favoriteRecipeIdsJson);
    sheet.getRange(row, 4).setValue(favoriteEquipmentIdsJson);
    sheet.getRange(row, 5).setValue(defaultFiltersJson);
    sheet.getRange(row, 6).setValue(recentViewsJson);
    sheet.getRange(row, 7).setValue(recentSearchesJson);
    sheet.getRange(row, 8).setValue(now);
    sheet.getRange(row, 10).setValue(now);
  } else {
    // 新規行を追加
    sheet.appendRow([
      userIdHash,
      displayName,
      favoriteRecipeIdsJson,
      favoriteEquipmentIdsJson,
      defaultFiltersJson,
      recentViewsJson,
      recentSearchesJson,
      now, // lastLoginAt
      now, // createdAt
      now  // updatedAt
    ]);
  }
  return { success: true };
}

// Googleドライブ画像アップロード処理
function uploadRecipeImage(payload) {
  const fileData = payload.fileData; // Base64
  const fileName = payload.fileName || 'recipe_image.jpg';
  const type = payload.type || 'originals'; // 'originals', 'thumbnails', 'raw'
  const mimeType = payload.mimeType || 'image/jpeg';
  
  if (!fileData) throw new Error('fileData is empty');

  // 親フォルダの取得または作成
  const rootFolder = getOrCreateAppFolder();
  let folderName = 'images/originals';
  if (type === 'thumbnails') folderName = 'images/thumbnails';
  if (type === 'raw') folderName = 'uploads/raw';
  
  const targetFolder = getOrCreateSubFolder(rootFolder, folderName);
  
  // Base64デコードしてファイル作成
  const decodedData = Utilities.base64Decode(fileData.split(',')[1] || fileData);
  const blob = Utilities.newBlob(decodedData, mimeType, fileName);
  const file = targetFolder.createFile(blob);
  
  // 共有設定を変更（誰でもリンクを知っていれば閲覧可能にする）
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  
  return {
    fileId: file.getId(),
    imageUrl: 'https://lh3.googleusercontent.com/d/' + file.getId(),
    fileName: fileName,
    fileSize: file.getSize()
  };
}

// Googleドライブのルートフォルダの取得
function getOrCreateAppFolder() {
  const props = PropertiesService.getScriptProperties();
  const folderId = props.getProperty('DRIVE_FOLDER_ID');
  // 有効なDriveフォルダIDは通常25文字以上であり、スペースを含まない
  if (folderId && folderId.length > 20 && folderId.indexOf(' ') === -1) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      Logger.log('Configured DRIVE_FOLDER_ID is invalid: ' + e);
    }
  }

  // 存在しない場合はマイドライブ直下に新規作成
  const folders = DriveApp.getFoldersByName('recipe-app');
  if (folders.hasNext()) {
    const f = folders.next();
    props.setProperty('DRIVE_FOLDER_ID', f.getId());
    return f;
  }
  const newFolder = DriveApp.createFolder('recipe-app');
  props.setProperty('DRIVE_FOLDER_ID', newFolder.getId());
  return newFolder;
}

// サブフォルダの作成または取得（パス形式 'images/originals'）
function getOrCreateSubFolder(parentFolder, path) {
  const parts = path.split('/');
  let currentFolder = parentFolder;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const folders = currentFolder.getFoldersByName(part);
    if (folders.hasNext()) {
      currentFolder = folders.next();
    } else {
      currentFolder = currentFolder.createFolder(part);
    }
  }
  return currentFolder;
}

// Gemini APIを用いた画像からのレシピ情報抽出
function parseRecipeWithGemini(payload) {
  const props = PropertiesService.getScriptProperties();
  const geminiKey = props.getProperty('GEMINI_API_KEY');
  if (!geminiKey) throw new Error('GEMINI_API_KEY is not configured in script properties');

  const fileId = payload.fileId;
  const file = DriveApp.getFileById(fileId);
  const blob = file.getBlob();
  const base64Image = Utilities.base64Encode(blob.getBytes());
  const mimeType = blob.getContentType();

  const prompt = `
画像からレシピ情報を抽出し、以下のJSON形式で結果を返してください。
余計なマークダウンや説明テキストは一切含まず、純粋なJSONデータ（JSONブロックではない）のみを返してください。
すべての項目が重要ですが、以下の抽出ルールを厳格に守ってください。

【抽出ルール】
- title: レシピ名（必須）
- summary: レシピの簡単な説明。画像にない場合は自動で簡潔に要約してください（任意）
- category: 料理カテゴリ（「主菜」「副菜」「汁物」「主食」「デザート」「作り置き」から最適のものを1つ選ぶこと。必須）
- genre: 料理ジャンル（「和食」「洋食」「中華」「韓国」「エスニック」「その他」から1つ選ぶこと。任意）
- equipmentIds: 対応調理機器の配列。画像に登場するか、そのレシピに最適な調理機器をIDで設定してください。複数選択可。
  例: ['rakucooker_pro', 'hotcook', 'bistro', 'frying_pan', 'pot', 'microwave']
- cookingMethods: 調理方法の配列（「圧力」「煮る」「焼く」「蒸す」「レンジ」「オーブン」「和える」「炒める」等から抽出。任意）
- timeMin: 調理時間の目安（分。数字のみ。任意）
- difficulty: 難易度（「かんたん」「普通」「手間あり」から1つ選ぶこと）
- servings: 何人分か（例: "2人分"）
- tags: 特徴を示すタグの配列（例: ['時短', '子ども向け', '節約', 'ヘルシー', '作り置き']。任意）
- ingredientsJson: 材料リストの配列。各要素は以下のオブジェクトである必要があります。
  {
    "name": "食材名や調味料名",
    "quantity": 数値（数値化できるもののみ。例: 300, 1.5, 2。数値化できない場合は null）,
    "unit": "単位。例: g,ml,個,大さじ,小さじ,片",
    "note": "補足情報。例: 一口大に切る、みじん切り、少々、適量など。数値化できない量はここに書く"
  }
- stepsJson: 手順リストの配列。各要素は文字列。
- notes: コツやポイントなど補足説明（任意）
- sourceText: OCR等で読み取れた画像のテキスト全文（任意）

【出力JSONフォーマット】
{
  "title": "",
  "summary": "",
  "category": "",
  "genre": "",
  "equipmentIds": [],
  "cookingMethods": [],
  "timeMin": 20,
  "difficulty": "普通",
  "servings": "2人分",
  "tags": [],
  "ingredientsJson": [
    {"name": "鶏もも肉", "quantity": 300, "unit": "g", "note": "一口大"},
    {"name": "しょうゆ", "quantity": 2, "unit": "大さじ", "note": ""}
  ],
  "stepsJson": [
    "鶏肉を切る",
    "調味料と合わせる"
  ],
  "notes": "",
  "sourceText": ""
}
`;

  const requestBody = {
    contents: [{
      parts: [
        { text: prompt },
        {
          inlineData: {
            mimeType: mimeType,
            data: base64Image
          }
        }
      ]
    }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=' + geminiKey;
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true
  };

  const response = UrlFetchApp.fetch(url, options);
  const responseText = response.getContentText();
  
  if (response.getResponseCode() !== 200) {
    throw new Error('Gemini API Error: ' + responseText);
  }

  const resJson = JSON.parse(responseText);
  let parsedRecipeText = resJson.candidates[0].content.parts[0].text;
  
  // JSON部分のみをトリミング
  const startIdx = parsedRecipeText.indexOf('{');
  const endIdx = parsedRecipeText.lastIndexOf('}');
  if (startIdx >= 0 && endIdx >= 0) {
    parsedRecipeText = parsedRecipeText.substring(startIdx, endIdx + 1);
  }
  
  const parsedRecipe = JSON.parse(parsedRecipeText);

  // 下書きシートへ保存
  const draftId = 'D' + Utilities.formatDate(new Date(), 'GMT+9', 'yyyyMMddHHmmss');
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const draftSheet = ss.getSheetByName('RecipeDrafts');
  
  // 下書き登録
  draftSheet.appendRow([
    draftId,
    fileId,
    JSON.stringify(parsedRecipe),
    parsedRecipe.sourceText || '',
    '[]', // validationErrorsJson (初期はエラーなし想定)
    'draft',
    '', // publishedRecipeId
    payload.userIdHash || 'admin',
    new Date(), // createdAt
    new Date()  // updatedAt
  ]);

  return {
    draftId: draftId,
    rawImageFileId: fileId,
    parsedRecipe: parsedRecipe
  };
}

// レシピ下書きの更新
function saveRecipeDraft(payload) {
  const draftId = payload.draftId;
  const parsedRecipe = payload.parsedRecipe;
  const status = payload.status || 'draft';
  
  if (!draftId) throw new Error('draftId is required');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName('RecipeDrafts');
  const drafts = getSheetDataAsObjects('RecipeDrafts');
  
  const rowIndex = drafts.findIndex(d => d.draftId === draftId);
  if (rowIndex < 0) throw new Error('Draft not found: ' + draftId);
  
  const row = rowIndex + 2;
  sheet.getRange(row, 3).setValue(JSON.stringify(parsedRecipe));
  sheet.getRange(row, 6).setValue(status);
  sheet.getRange(row, 10).setValue(new Date()); // updatedAt

  return { success: true };
}

// レシピ下書きから本登録
function publishRecipeDraft(payload) {
  const draftId = payload.draftId;
  const finalRecipe = payload.finalRecipe; // 編集後の最終レシピデータ
  
  if (!draftId) throw new Error('draftId is required');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. レシピIDの生成 (連番)
  const recipeSheet = ss.getSheetByName('Recipes');
  const recipes = getSheetDataAsObjects('Recipes');
  let newIdNum = 1;
  if (recipes.length > 0) {
    // 既存の最大IDを解析
    const ids = recipes.map(r => {
      const match = r.recipeId.match(/R(\d+)/);
      return match ? parseInt(match[1], 10) : 0;
    });
    newIdNum = Math.max(...ids) + 1;
  }
  const newRecipeId = 'R' + String(newIdNum).padStart(6, '0');
  const now = new Date();

  // 食材検索用キーワード配列を自動生成 (ひらがなカタカナ等を考慮しても良いが、一旦は食材名の配列)
  const keywords = (finalRecipe.ingredientsJson || []).map(i => i.name).filter(Boolean);

  // 2. 本登録シートへ行追加
  recipeSheet.appendRow([
    newRecipeId,
    finalRecipe.title,
    finalRecipe.summary || '',
    finalRecipe.category,
    finalRecipe.genre || '',
    JSON.stringify(finalRecipe.equipmentIds || []),
    JSON.stringify(finalRecipe.cookingMethods || []),
    JSON.stringify(keywords),
    finalRecipe.timeMin || 0,
    finalRecipe.difficulty || '普通',
    JSON.stringify(finalRecipe.tags || []),
    finalRecipe.servings || '2人分',
    JSON.stringify(finalRecipe.ingredientsJson || []),
    JSON.stringify(finalRecipe.stepsJson || []),
    finalRecipe.notes || '',
    finalRecipe.imageFileId || '',
    finalRecipe.thumbnailFileId || '',
    finalRecipe.imageUrl || '',
    finalRecipe.thumbnailUrl || '',
    finalRecipe.source || '',
    'published',
    now, // createdAt
    now  // updatedAt
  ]);

  // 3. 下書きシートの状態更新
  const draftSheet = ss.getSheetByName('RecipeDrafts');
  const drafts = getSheetDataAsObjects('RecipeDrafts');
  const rowIndex = drafts.findIndex(d => d.draftId === draftId);
  if (rowIndex >= 0) {
    const row = rowIndex + 2;
    draftSheet.getRange(row, 6).setValue('published'); // status
    draftSheet.getRange(row, 7).setValue(newRecipeId); // publishedRecipeId
    draftSheet.getRange(row, 10).setValue(now); // updatedAt
  }

  return {
    recipeId: newRecipeId,
    success: true
  };
}

// スプレッドシートのバックアップ作成
function backupSpreadsheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const file = DriveApp.getFileById(ss.getId());
  
  const rootFolder = getOrCreateAppFolder();
  const backupFolder = getOrCreateSubFolder(rootFolder, 'backups');
  
  const formattedDate = Utilities.formatDate(new Date(), 'GMT+9', 'yyyyMMdd-HHmmss');
  const backupName = 'recipe-app-backup-' + formattedDate;
  
  const backupFile = file.makeCopy(backupName, backupFolder);
  
  return {
    backupFileName: backupName,
    backupFileId: backupFile.getId()
  };
}

// -------------------------------------------------------------
// 3. トリガー設定用 (週1回自動バックアップを設定するための関数)
// -------------------------------------------------------------
function setupBackupTrigger() {
  // 既存のバックアップトリガーを削除して再作成
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'backupSpreadsheet') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  
  // 毎週日曜日の深夜2時にバックアップを実行するように設定
  ScriptApp.newTrigger('backupSpreadsheet')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(2)
    .create();
    
  Logger.log('Weekly backup trigger configured successfully.');
}

// -------------------------------------------------------------
// 4. ドライブ内の画像一括スキャン＆スプレッドシート自動紐付け
// -------------------------------------------------------------
function syncDriveImages() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const recipeSheet = ss.getSheetByName('Recipes');
  const recipes = getSheetDataAsObjects('Recipes');
  
  const rootFolder = getOrCreateAppFolder();
  const originalsFolder = getOrCreateSubFolder(rootFolder, 'images/originals');
  
  // Googleドライブ内のファイルをスキャンしてマップ化
  const originalFiles = originalsFolder.getFiles();
  const fileMap = {}; // { recipeId: { fileId, url } }
  
  Logger.log('Scanning folder URL: ' + originalsFolder.getUrl());
  
  let scanCount = 0;
  while (originalFiles.hasNext()) {
    const file = originalFiles.next();
    const name = file.getName().toLowerCase(); // 例: mh_1.jpg
    scanCount++;
    Logger.log('Found file in Drive: ' + file.getName());
    const match = name.match(/^(mh_\d+|rgsk_\d+)\.(jpg|jpeg|png)$/i);
    if (match) {
      const recipeId = match[1].toUpperCase();
      // 外部からリンクで表示できるよう共有設定を「リンクを知っている全員に閲覧許可」に変更
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileMap[recipeId] = {
        fileId: file.getId(),
        url: 'https://lh3.googleusercontent.com/d/' + file.getId()
      };
    }
  }
  Logger.log('Total files found in folder: ' + scanCount);

  // スプレッドシートの更新
  const headers = recipeSheet.getRange(1, 1, 1, recipeSheet.getLastColumn()).getValues()[0];
  const imgIdColIdx = headers.indexOf('imageFileId') + 1;
  const imgUrlColIdx = headers.indexOf('imageUrl') + 1;
  const thumbIdColIdx = headers.indexOf('thumbnailFileId') + 1;
  const thumbUrlColIdx = headers.indexOf('thumbnailUrl') + 1;

  if (imgIdColIdx === 0 || imgUrlColIdx === 0) {
    throw new Error('Required image columns (imageFileId or imageUrl) not found in Recipes sheet.');
  }

  let updateCount = 0;
  for (let i = 0; i < recipes.length; i++) {
    const recipe = recipes[i];
    const rId = recipe.recipeId.toUpperCase();
    if (fileMap[rId]) {
      const row = i + 2;
      const fileInfo = fileMap[rId];
      
      recipeSheet.getRange(row, imgIdColIdx).setValue(fileInfo.fileId);
      recipeSheet.getRange(row, imgUrlColIdx).setValue(fileInfo.url);
      
      // サムネイル列があればオリジナル画像で初期設定
      if (thumbIdColIdx > 0) recipeSheet.getRange(row, thumbIdColIdx).setValue(fileInfo.fileId);
      if (thumbUrlColIdx > 0) recipeSheet.getRange(row, thumbUrlColIdx).setValue(fileInfo.url);
      
      updateCount++;
    }
  }
  
  Logger.log('Successfully synchronized ' + updateCount + ' images from Drive.');
}
