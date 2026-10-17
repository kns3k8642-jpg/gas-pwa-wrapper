# 調理器具フィルター修正 引継ぎ
- 目的: 単独/複数選択、再表示、解除を正しく機器IDで扱う。
- 型07: 完成条件は不具合再現、ローカルUI検証、公開後の実データ確認。
- 判断: 既存の未公開マスタ正規化修正を採用。GAS変更は不要。公開済みnickname修正を保持するため863cd27から分離チェックアウト。
- 検証済み: 修正前の公開版で11器具全てdata-id=undefinedと0件/全選択を再現。ローカルの空白付き見出しモックでhotcook単独1件、hotcook+rakucooker_proで2件、再表示保持、リセット2件。
- 次: masterへfast-forward push後、Pages配信と公開実データで単独/複数/リセット/再読込を確認する。
- 未確認: 実機Android。ローカルの画像・Service Workerはfixture対象外。

### 公開後の実測（2026-10-17）
- 修正commit: bb148bb860dc40d62c675f4bb38a11ed16a7987f。masterへfast-forward push済み。
- Pages: built、公開recipe.html HTTP 200。normalizeEquipmentMasterと既存registerUserStateの両方を確認。
- Edge UI: ホットクック136件（136カードすべて機器表示にホットクックを含む）、ラクラクッカープロ67件、両方203件、リセット1497件。
- 再表示: ホットクックだけオン、他10器具はオフ。再読み込み: ラクラクッカープロの67件と単独選択を保持。
- 古いundefined選択: 修正前の不正状態を残して再読込後、自動解除され全1497件へ復帰。
- 完了: ローカルHTML UI・公開実データUI・配信確認まで実施済み。Android実機は未確認。
