"""Assemble the fixed-scale Mikasa render comparison."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'resources/female-mikasa-progression'
stages=['Starter','Developing','Strong','Elite','Legendary']
W,H=2460,940
sheet=Image.new('RGB',(W,H),(13,11,23))
d=ImageDraw.Draw(sheet)
fontroot=Path('C:/Windows/Fonts')
def font(name,size):return ImageFont.truetype(str(fontroot/name),size)
title=font('segoeuib.ttf',39);label=font('segoeuib.ttf',27);small=font('segoeui.ttf',21)
d.text((34,21),'MIKASA / PHYSIQUE PROGRESSION',font=title,fill=(242,234,253))
d.text((34,73),'Same character. Five earned stages.',font=small,fill=(162,147,183))
descs=['Healthy and lean','Building strength','Athletic and defined','Powerful and muscular','Maximum fantasy physique']
for i,stage in enumerate(stages):
    x=30+i*480
    if i:d.line((x-10,130,x-10,H-34),fill=(44,35,61),width=1)
    d.text((x+230,128),stage,font=label,fill=(209,166,253),anchor='mt')
    img=Image.open(OUT/'review'/f'{stage.lower()}-front.png').convert('RGBA')
    img=img.resize((460,690),Image.Resampling.LANCZOS)
    sheet.paste(img,(x,166),img)
    d.text((x+230,876),descs[i],font=small,fill=(183,170,202),anchor='mt')
sheet.save(OUT/'Female_Mikasa_Progression_Comparison.png')
print(OUT/'Female_Mikasa_Progression_Comparison.png')
