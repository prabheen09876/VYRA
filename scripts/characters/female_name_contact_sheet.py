"""Assemble actual Blender renders into consistent five-stage review sheets."""
from pathlib import Path
import hashlib,json
from PIL import Image,ImageDraw,ImageFont

ROOT=Path(__file__).resolve().parents[2];OUT=ROOT/'resources/female-name-progression'
STAGES=['Starter','Developing','Strong','Elite','Legendary']
def font(size,bold=False):return ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf',size)
for suffix,filename,subtitle in [('', 'comparison.png','Same character, fixed framing, progressively developed shoulders, arms, core and legs.'),
 ('-Walking','animation-comparison.png','Original Walking clip - frame 10 at 24 fps. The original staff and dress behavior are retained.')]:
 width,height=2500,940;sheet=Image.new('RGB',(width,height),'#111a26');draw=ImageDraw.Draw(sheet)
 draw.text((36,23),'FEMALE_NAME / FITNESS PROGRESSION',font=font(28,True),fill='#e8eff5')
 draw.text((37,68),subtitle,font=font(17),fill='#9eafbd')
 for column,stage in enumerate(STAGES):
  x=25+column*495
  draw.rounded_rectangle((x,110,x+470,859),radius=16,fill='#1b2938')
  render=Image.open(OUT/'review'/f'{stage}{suffix}.png').convert('RGBA')
  render.thumbnail((460,720),Image.Resampling.LANCZOS)
  sheet.paste(render,(x+(470-render.width)//2,110),render)
  draw.text((x+22,808),stage.upper(),font=font(25,True),fill=['#a1c8dd','#7fd3c5','#85adff','#b6a1ed','#ebca8c'][column])
 draw.text((36,895),'29 preserved joints  /  14 original clips  /  43,748 triangles per stage  /  original materials and textures',font=font(17),fill='#9eafbd')
 sheet.save(OUT/filename)
metadata={'renderer':'Blender 5.2 Cycles','clipsRendered':[{'name':'Walking','requestedSeconds':.4,'evaluatedFrame':10,'fps':24}],
 'sourceComparedAtSameFrame':True,'reviewImages':['comparison.png','animation-comparison.png','review/source-Walking.png','review/Legendary-side.png'],
 'assets':[{'stage':s,'file':f'Female_Name_{s}.glb','sha256':hashlib.sha256((OUT/f'Female_Name_{s}.glb').read_bytes()).hexdigest()} for s in STAGES],
 'scope':'Actual textured rest renders for all stages and a shared existing clip frame for all stages, compared to source. This is representative visual QA, not exhaustive testing of every frame in all 14 clips.'}
(OUT/'animation-review.json').write_text(json.dumps(metadata,indent=2)+'\n')
print(OUT/'comparison.png');print(OUT/'animation-comparison.png')
