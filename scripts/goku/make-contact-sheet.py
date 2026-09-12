"""Compose the actual Blender renders at identical scale for visual comparison."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'resources/goku-progression'
STAGES = ['Starter','Developing','Strong','Elite','Legendary']
DETAILS = ['Lean beginner','Early development','Muscular fighter','Elite warrior','Fantasy physique']
COLORS = ['#91A9B9','#8BC5B6','#8AB9EE','#B5A3E2','#EDBF75']
WIDTH, HEIGHT = 2400, 1040


def font(size, bold=False):
    return ImageFont.truetype('C:/Windows/Fonts/segoeuib.ttf' if bold else 'C:/Windows/Fonts/segoeui.ttf',size)


for silhouette in [False,True]:
    image=Image.new('RGB',(WIDTH,HEIGHT),'#10161E')
    draw=ImageDraw.Draw(image)
    draw.text((56,36),'VYRA  /  CHARACTER PROGRESSION',font=font(20,True),fill='#A9BECE')
    draw.text((53,78),'One fighter. Five physiques.',font=font(44,True),fill='#F2F5F7')
    draw.text((WIDTH-57,100),'SILHOUETTE STUDY' if silhouette else 'ACTUAL GLB RENDERS',
              font=font(18,True),fill='#7F94A7',anchor='ra')
    for i,(name,detail,color) in enumerate(zip(STAGES,DETAILS,COLORS)):
        left=45+i*465
        draw.rounded_rectangle((left,167,left+449,961),radius=16,fill='#19232E')
        draw.text((left+23,186),f'0{i+1}',font=font(18,True),fill=color)
        asset=Image.open(OUT/'review'/f'{name.lower()}-front.png').convert('RGBA')
        asset=asset.resize((540,720),Image.Resampling.LANCZOS)
        x=left+(449-540)//2; y=199
        if silhouette:
            alpha=asset.getchannel('A')
            asset=Image.new('RGBA',asset.size,color)
            asset.putalpha(alpha)
        shadow=Image.new('RGBA',(WIDTH,HEIGHT))
        sd=ImageDraw.Draw(shadow)
        sd.ellipse((left+80,868,left+367,884),fill=(0,0,0,115))
        image.paste(shadow.filter(ImageFilter.GaussianBlur(10)),(0,0),shadow.filter(ImageFilter.GaussianBlur(10)))
        image.paste(asset,(x,y),asset)
        draw=ImageDraw.Draw(image)
        draw.text((left+23,896),name.upper(),font=font(23,True),fill=color)
        draw.text((left+23,929),detail,font=font(18),fill='#ADBDCA')
    draw.text((56,988),'Matched height, camera, and ground. Original face, hair, outfit, and texture.',
              font=font(19),fill='#93A8B9')
    draw.text((WIDTH-56,988),'GOKU / 3D MORE / CC BY 4.0 / MODIFIED FOR VYRA',
              font=font(16),fill='#667E91',anchor='ra')
    path=OUT/('Goku_Progression_Silhouettes.png' if silhouette else 'Goku_Progression_Comparison.png')
    image.save(path)
    print(path)
