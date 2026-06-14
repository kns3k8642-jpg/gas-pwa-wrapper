# GAS PWA Wrapper 開発フロー & 仕様書

このディレクトリは、Google Apps Script (GAS) で作成したウェブアプリケーションを、スマートフォン（iOS/Android）のホーム画面からアドレスバーなし（Standalone）で自然に起動させるためのPWAラッパーコンポーネントです。

## 📦 ファイル構成
- `stock.html`: GAS Webアプリを `iframe` で全画面表示し、Service Workerを登録するラッパーHTML。
- `stock_manifest.json`: アプリの名前やアイコン、Standaloneモードの起動形式を定義するWeb App Manifest。
- `stock_sw.js`: キャッシュ登録とGAS関連リクエストの除外設定を記述したService Worker。
- `stock_sw_simple.js`: キャッシュ処理を行わないダミーのService Worker（最小限のPWA要件用）。

---

## 📱 スマホ用サイト作成フロー（PWAラッパー構築手順）

GASで公開したウェブアプリをスマホアプリ化する際の手順です。

### STEP 1: GitHubでPages公開用のリポジトリを用意
1. GitHubで新規リポジトリ（例: `gas-pwa-wrapper`）を作成します。
2. リポジトリの `Settings` > `Pages` を開き、公開元（Build and deployment）を `main` または `master` ブランチの `/docs` フォルダに指定して保存します。

### STEP 2: ラッパーHTML (`stock.html`) の設定
1. `docs/stock.html` を作成（またはこのリポジトリのものを流用）します。
2. `iframe` の `src` 属性に、公開したいGASのWebアプリURL（`https://script.google.com/macros/s/.../exec`）を埋め込みます。
3. 必要に応じて `<title>` や `<meta name="apple-mobile-web-app-title">` のタイトルを変更します。

### STEP 3: マニフェスト (`stock_manifest.json`) の設定
1. アプリの名前（`name` / `short_name`）をお好みのものに変更します。
2. アイコン画像（`icons`）に、ホーム画面に表示したいアプリアイコンのURLを指定します（GASで使うドライブ画像や、外部CDN・リポジトリ内の画像）。
3. `"display": "standalone"` を維持します（これによりブラウザのアドレスバーが非表示になります）。

### STEP 4: サービスワーカー (`stock_sw.js`) の設定
1. サービスワーカーがPWAの要件（オフラインキャッシュの登録）を自動で満たします。
2. もしGAS以外のURL（別のWebサイト等）をラップする場合は、`stock_sw.js` 内の除外判定（`script.google.com` の判定箇所）を適切に変更します。

### STEP 5: GitHubにプッシュ
1. ファイル群をコミットし、GitHubにプッシュします。
2. GitHub Pagesのデプロイが完了するのを数分待ちます。

### STEP 6: スマホで「ホーム画面に追加」
1. スマートフォンのSafari（iOS）またはChrome（Android）で、GitHub Pagesの公開URL（例: `https://<ユーザー名>.github.io/gas-pwa-wrapper/stock.html`）にアクセスします。
2. ブラウザの共有メニューから「ホーム画面に追加」を実行します。
3. ホーム画面に追加されたアプリアイコンから起動すると、アドレスバーのないフルスクリーンのネイティブアプリ感覚で動作します。

---

## 💡 技術的な実装のポイント
1. **GASのドメイン制限回避**: GASの `script.google.com` ドメイン内にService Worker等を登録するのは困難なため、GitHub Pages（別ドメイン）にラッパーHTMLを置き、そこから `iframe` で読み込むことでPWA化を成立させています。
2. **スクロールバウンスの抑制**: iOSで画面を引っ張った際にブラウザ特有の白い余白（バウンス）が見えて「Webアプリ感」が出てしまうのを防ぐため、`touchmove` イベントによる抑制コードが `stock.html` に記述されています。
3. **動的リクエストのキャッシュ除外**: GASのWebアプリとのデータ送受信を妨げないように、`script.google.com` や `googleusercontent.com` への通信はService Worker의キャッシュから除外するよう `stock_sw.js` に記述されています。
