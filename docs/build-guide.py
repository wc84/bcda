import base64, io, os, subprocess

SHOTS = 'C:/nlt/shots'
OUT_HTML = 'C:/nlt/guide.html'
OUT_PDF = 'C:/Users/wchoe/Desktop/bcda/docs/BCDA-Admin-Guide.pdf'
CHROME = r'C:\Program Files\Google\Chrome\Application\chrome.exe'

USED = []
def img(name, alt='', cls=''):
    path = f'{SHOTS}/{name}.png'
    if not os.path.exists(path):
        raise SystemExit(f'MISSING SCREENSHOT: {name}')
    USED.append(name)
    b64 = base64.b64encode(open(path, 'rb').read()).decode()
    c = f' class="{cls}"' if cls else ''
    return f'<img{c} src="data:image/png;base64,{b64}" alt="{alt}">'

HTML = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>BCDA Admin Guide</title>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Special+Elite&family=Inter:wght@400;500;600;700&display=swap">
<style>
@page {{ size: Letter; margin: 16mm 15mm 18mm; }}
* {{ box-sizing: border-box; }}
body {{ margin:0; font-family:'Inter',system-ui,sans-serif; font-size:11.5pt; line-height:1.55;
        color:#1A1A1A; background:#fff; }}
h1,h2,h3 {{ font-family:'Anton',Impact,sans-serif; font-weight:400; text-transform:uppercase;
            letter-spacing:-.01em; margin:0; line-height:1.08; }}
h1 {{ font-size:34pt; color:#084D29; }}
h2 {{ font-size:17pt; color:#084D29; }}
h3 {{ font-size:12pt; color:#0D6B3A; margin-top:12pt; }}
p {{ margin:0 0 9pt; }}
.lab {{ font-family:'Special Elite',monospace; font-size:8.5pt; letter-spacing:.16em;
        text-transform:uppercase; color:#E87722; margin:0 0 3pt; }}
.cover {{ height:232mm; display:flex; flex-direction:column; justify-content:center;
          page-break-after:always; }}
.cover .rule {{ height:7px; background:#0D6B3A; width:120px; margin:16pt 0; }}
.cover .sub {{ font-size:14pt; color:#3D3A33; max-width:112mm; }}
.cover .meta {{ margin-top:auto; font-size:9.5pt; color:#6E6553; border-top:1.5pt solid #D9C9A4;
                padding-top:9pt; }}
.step {{ page-break-inside:avoid; margin:0 0 16pt; }}
.head {{ display:flex; gap:11pt; align-items:flex-start; margin-bottom:7pt; }}
.num {{ font-family:'Anton',sans-serif; font-size:15pt; color:#fff; background:#0D6B3A;
        width:26pt; height:26pt; border-radius:50%; display:flex; align-items:center;
        justify-content:center; flex:0 0 auto; }}
img {{ max-width:100%; display:block; border:1.5pt solid #1A1A1A; border-radius:5px;
       margin:8pt 0 4pt; }}
img.btn {{ max-width:210px; }}
.cap {{ font-size:9pt; color:#6E6553; margin:0 0 10pt; font-style:italic; }}
ol,ul {{ margin:0 0 9pt; padding-left:16pt; }}
li {{ margin-bottom:4pt; }}
.callout {{ border-left:4pt solid #E87722; background:#FDF6EC; padding:8pt 11pt;
            margin:9pt 0; page-break-inside:avoid; }}
.callout.warn {{ border-left-color:#B33A1A; background:#FBEDE8; }}
.callout.good {{ border-left-color:#0D6B3A; background:#EDF5EF; }}
.callout p:last-child {{ margin-bottom:0; }}
.callout b {{ color:#084D29; }}
table {{ width:100%; border-collapse:collapse; font-size:10pt; margin:8pt 0 12pt;
         page-break-inside:avoid; }}
th,td {{ text-align:left; padding:5pt 7pt; border-bottom:1pt solid #E4DAC2; vertical-align:top; }}
th {{ font-family:'Special Elite',monospace; font-size:8pt; letter-spacing:.1em;
      text-transform:uppercase; color:#fff; background:#084D29; }}
.pagebreak {{ page-break-before:always; }}
.kbd {{ font-family:'Special Elite',monospace; background:#EDE0C2; padding:1pt 5pt;
        border-radius:3px; font-size:9.5pt; }}
</style></head><body>

<section class="cover">
  <p class="lab">Broward County Darts Association</p>
  <h1>How to update<br>the scoreboard</h1>
  <div class="rule"></div>
  <p class="sub">A step-by-step guide for league admins. Takes about five minutes each week.
     No technical knowledge needed.</p>
  <div class="meta">
    Public scoreboard &nbsp;·&nbsp; smartdart.net/bcda/scoreboard<br>
    Admin page &nbsp;·&nbsp; smartdart.net/bcda/admin
  </div>
</section>

<h2>Before you start</h2>
<p>You need three things. Get these ready before you sit down:</p>
<table>
  <tr><th style="width:32%">What</th><th>Where it comes from</th></tr>
  <tr><td><b>The cricket file</b></td><td>Exported from DartConnect. A <span class="kbd">.csv</span> file.</td></tr>
  <tr><td><b>The &rsquo;01 file</b></td><td>Also exported from DartConnect. Also a <span class="kbd">.csv</span> file.</td></tr>
  <tr><td><b>The admin passcode</b></td><td>Ask whoever set up the site. It is the same one every week.</td></tr>
</table>
<div class="callout">
  <p><b>You cannot break anything.</b> Nothing goes on the public scoreboard until you press
  the <b>Publish</b> button at the very end. Everything before that is just you looking at it.
  And even after publishing, any earlier week can be put back with one click.</p>
</div>

<div class="step">
  <div class="head"><div class="num">1</div><div>
    <p class="lab">Step one</p><h2>Sign in</h2></div></div>
  <p>Go to <b>smartdart.net/bcda/admin</b> in any web browser, on a phone or a computer.
     Type the passcode and press <b>Sign in</b>.</p>
  {img('01-signin', 'The sign in screen')}
  <p class="cap">The sign-in screen. The passcode shows as dots as you type &mdash; that is normal.</p>
  <div class="callout good"><p>Once you sign in you stay signed in for <b>8 hours</b>.
     If you come back the next day you will be asked for the passcode again.</p></div>
</div>

<div class="step">
  <div class="head"><div class="num">2</div><div>
    <p class="lab">Step two</p><h2>Say which board this is</h2></div></div>
  <ol>
    <li>Type the <b>season</b> name, for example <span class="kbd">Winter/Spring 2026</span>.</li>
    <li>Tap the <b>league</b>: Singles, Doubles or Teams.</li>
  </ol>
  {img('03-season-league', 'Season and league selection')}
  <p class="cap">Type the season the same way every week, exactly. Players see this name on the scoreboard.</p>
  <div class="callout warn"><p><b>Spelling matters here.</b> If you type
     <span class="kbd">Winter/Spring 2026</span> one week and <span class="kbd">Winter Spring 2026</span>
     the next, the site treats them as two different seasons and you will end up with two
     separate boards. After the first week the season name appears in a dropdown &mdash;
     pick it from there instead of retyping it.</p></div>
</div>

<div class="step pagebreak">
  <div class="head"><div class="num">3</div><div>
    <p class="lab">Step three</p><h2>Add the two files</h2></div></div>
  <p>Drag both <span class="kbd">.csv</span> files from your computer onto the big dashed box.
     Or click the box to browse for them.</p>
  {img('04-dropzone-empty', 'The empty drop area')}
  <p class="cap">Before: the drop area is empty and both slots say &ldquo;Nothing yet&rdquo;.</p>
  <p>When the files land, each one drops into the correct slot on its own and the boxes
     turn green. <b>The order does not matter</b> &mdash; the site works out which file is which
     by looking inside them.</p>
  {img('05-dropzone-filled', 'Both files accepted')}
  <p class="cap">After: both slots are green and show the file names. Now press <b>Process</b>.</p>
  <div class="callout"><p>Dropped the wrong file? Press <b>Clear</b> and start the step again.
     If you drop something that is not a DartConnect export, the site tells you so and ignores it.</p></div>
</div>

<div class="step pagebreak">
  <div class="head"><div class="num">4</div><div>
    <p class="lab">Step four</p><h2>Check it before it goes out</h2></div></div>
  <p>Pressing <b>Process</b> shows you what the scoreboard <i>would</i> look like. Nothing is
     public yet. Read the row of numbers along the top:</p>
  {img('07-preview-numbers', 'The summary numbers')}
  <table>
    <tr><th style="width:24%">Number</th><th>What it means</th></tr>
    <tr><td><b>Players</b></td><td>How many people are in the files. Does it look about right?</td></tr>
    <tr><td><b>Divisions</b></td><td>Which divisions were found, usually A and B.</td></tr>
    <tr><td><b>New</b></td><td>People who were not on the board last week.</td></tr>
    <tr><td><b>Changed</b></td><td>People whose total moved since last week.</td></tr>
    <tr><td><b>Warnings</b></td><td>Things worth a look. Not errors. See <b>If something looks wrong</b>.</td></tr>
  </table>
  <p>Underneath is every player and their totals, so you can scan for anything odd.</p>
  {img('06-preview', 'The full preview')}
  <p class="cap">The full preview. The <b>vs live</b> column on the right shows what changed since last week.</p>
</div>

<div class="step">
  <div class="head"><div class="num">5</div><div>
    <p class="lab">Step five</p><h2>Publish it</h2></div></div>
  <p>Happy with it? Press the orange button at the bottom of the preview. The public
     scoreboard updates within seconds.</p>
  {img('09-publish-row', 'The publish button', 'btn')}
  <p class="cap">That is the whole job. You can close the page.</p>
  <div class="callout good"><p>Want to check? Open <b>smartdart.net/bcda/scoreboard</b>,
     or press <b>View scoreboard</b> at the top of the admin page.</p></div>
</div>

<h2 class="pagebreak">If something looks wrong</h2>

<h3>Warnings</h3>
<p>A warning is the site telling you something it could not work out on its own. It does not
   stop you publishing.</p>
{img('08-warnings', 'A warning message')}
<table>
  <tr><th style="width:38%">What it says</th><th>What to do</th></tr>
  <tr><td>No gender in the export</td>
      <td>That player will be left out of the High In / High Out tiles. Fix it in
          <b>Roster fixes</b> just below, then press Process again.</td></tr>
  <tr><td>Appears in one file but not the other</td>
      <td>That player is missing from one of the two exports. They will score zero for that
          half. Usually means the export was taken before their match was entered.</td></tr>
</table>

<h3>Roster fixes</h3>
<p>Some things are not in the DartConnect export at all, like a missing gender. Set them here
   once and the site remembers &mdash; uploading again next week will not wipe them.</p>
{img('10-roster', 'The roster fixes panel')}
<p class="cap">Pick the gender, then press <b>Save roster fixes</b>. The preview updates straight away.</p>

<div class="step pagebreak">
  <h2>Made a mistake? Put last week back</h2>
  <p>Every upload is kept. If a week goes out wrong, scroll down to <b>Published history</b>
     and press <b>Restore</b> next to the one you want back.</p>
  {img('11-history', 'Published history with restore buttons')}
  <p class="cap">The version currently on the scoreboard is marked <b>Live</b>. Everything else
     has a Restore button.</p>
  <div class="callout warn"><p><b>One thing to know:</b> Restore puts back an <i>earlier</i>
     version. It cannot remove the very first thing you ever publish for a season, because there
     is nothing older to go back to. To fix that, just publish the correct files over the top.</p></div>
</div>

<h2 class="pagebreak">Quick answers</h2>
<table>
  <tr><th style="width:40%">Question</th><th>Answer</th></tr>
  <tr><td>Do I have to do all three leagues at once?</td>
      <td>No. Each league is separate. Do Singles now and Doubles later if you like.</td></tr>
  <tr><td>I only have one of the two files.</td>
      <td>You can still publish. Players will score zero for the missing half, and you will get
          a warning for every player. Better to wait for both files.</td></tr>
  <tr><td>It says my passcode is wrong.</td>
      <td>Check for a stray space at the start or end. If it still fails, ask whoever set up
          the site &mdash; the passcode may have been changed.</td></tr>
  <tr><td>I published the wrong week.</td>
      <td>Use <b>Restore</b> in Published history, or simply upload the right files and publish
          again.</td></tr>
  <tr><td>Can I do this on my phone?</td>
      <td>Yes, if the CSV files are on the phone. A computer is usually easier for finding files.</td></tr>
  <tr><td>Someone is missing from the scoreboard.</td>
      <td>They were not in the DartConnect export. Check the export, not this site.</td></tr>
  <tr><td>The numbers look too low.</td>
      <td>Check you picked the right league at Step 2.</td></tr>
</table>

<div class="callout">
  <p><b>Still stuck?</b> Nothing you do on this page can damage the league records &mdash;
  the original files you upload are kept, so any week can always be rebuilt.</p>
</div>

</body></html>"""

os.makedirs(os.path.dirname(OUT_PDF), exist_ok=True)
io.open(OUT_HTML, 'w', encoding='utf-8').write(HTML)
print('screenshots used, in order:', ', '.join(USED))
print('html', round(os.path.getsize(OUT_HTML)/1024), 'KB')

subprocess.run([CHROME, '--headless', '--disable-gpu', '--no-pdf-header-footer',
                '--virtual-time-budget=20000',
                f'--print-to-pdf={OUT_PDF}', f'file:///{OUT_HTML}'],
               check=True, capture_output=True)
print('pdf', round(os.path.getsize(OUT_PDF)/1024), 'KB ->', OUT_PDF)
