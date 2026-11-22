# KODAIRA SVCs 名刺メーカー

こだいら災害ボランティアセンターサポーターズ（KODAIRA SVCs）の公式ロゴ・Instagram QR・公式HP QR を組み込んだ名刺を、ブラウザだけで作成できるツールです。

## 使い方
1. `index.html` をブラウザ（Chrome / Edge / Safari / Firefox の最新版）で開きます。
2. デザインを選びます（ナチュラル／カラーストライプ／フォレスト／モダンダーク／縦型）。
3. 肩書・氏名（必須）、ふりがな・メッセージ・連絡先（任意）を入力します。
4. 書体（ゴシック／丸ゴシック／明朝）と QR コードの有無を選びます。
5. ダウンロードします：
   - **PDF（名刺1枚）**：91×55mm。「塗り足し3mm」をONにすると印刷会社入稿用（97×61mm、TrimBox付き）
   - **PNG 画像**：350／600／1200 dpi
   - **A4 10面 PDF**：市販の名刺用紙（A4・10面、上下11mm／左右14mm余白）用。印刷時は「実際のサイズ（100%）」で。

## 構成
| ファイル | 内容 |
|---|---|
| `index.html` / `style.css` | 画面 |
| `app.js` | テンプレート描画・PNG/PDF 生成（外部ライブラリ不使用） |
| `assets.js` | `assets/` の画像を Base64 で埋め込んだもの（ローカルで開いても書き出せるようにするため） |
| `assets/` | 公式ロゴ・QR コード原本 |

画像を差し替えた場合は、`assets.js` も再生成してください（PowerShell）:

```powershell
$l=[Convert]::ToBase64String([IO.File]::ReadAllBytes("assets/logo.jpg"))
$i=[Convert]::ToBase64String([IO.File]::ReadAllBytes("assets/qr-instagram.png"))
$h=[Convert]::ToBase64String([IO.File]::ReadAllBytes("assets/qr-homepage.png"))
"window.SVCS_ASSETS={logo:'data:image/jpeg;base64,$l',ig:'data:image/png;base64,$i',hp:'data:image/png;base64,$h'};" | Set-Content assets.js -Encoding UTF8
```

## GitHub Pages で公開する
1. GitHub Desktop で「File → Add local repository」からこのフォルダを追加します。
2. 「Publish repository」を押します。このとき **「Keep this code private」のチェックを外して** 公開リポジトリにします（無料プランの GitHub Pages は公開リポジトリのみ）。
3. GitHub のリポジトリページで **Settings → Pages** を開き、Source を「Deploy from a branch」、Branch を「main」「/ (root)」にして Save します。
4. 1〜2分後、`https://<GitHubユーザー名>.github.io/svcs-card-builder/` で公開されます。

以降は、ファイルを変更して GitHub Desktop で Commit → Push すると自動で反映されます。

## 補足
- 日本語フォントは Google Fonts（Noto Sans JP / Zen Maru Gothic / Noto Serif JP）を使用します。オフライン時は PC のフォントで代用されます。
- 入力内容はブラウザの localStorage にのみ保存され、外部には送信されません。
- GitHub Pages などにそのまま置けば、メンバーがURLから利用できます。
