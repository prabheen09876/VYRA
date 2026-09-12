"""Render and assemble a consistently framed comparison of the five Sakura GLBs."""
from pathlib import Path
import argparse
import json
import subprocess
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'resources/female-sakura-progression'
STAGES=['Starter','Developing','Strong','Elite','Legendary']
parser=argparse.ArgumentParser()
parser.add_argument('--render',action='store_true',help='Re-render all five actual GLBs with Blender before assembling.')
args=parser.parse_args()
if args.render:
    blender=Path(r'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe')
    for stage in STAGES:
        command=[str(blender),'--background','--threads','2','--python',str(ROOT/'scripts/characters/render-character.py'),'--',
            '--input',str(OUT/f'Female_Sakura_{stage}.glb'),'--output',str(OUT/f'review/{stage.lower()}-front.png'),
            '--width','750','--height','1000','--frame-config',str(OUT/'review/framing.json')]
        subprocess.run(command,check=True)

canvas=Image.new('RGBA',(2500,860),'#242830')
draw=ImageDraw.Draw(canvas)
font_path=Path(r'C:\Windows\Fonts\segoeui.ttf')
def font(size):return ImageFont.truetype(str(font_path),size)
draw.text((42,24),'Female Sakura',fill='#f4f2ee',font=font(44))
draw.text((45,79),'Five physique stages',fill='#bbc3cf',font=font(25))
for index,stage in enumerate(STAGES):
    picture=Image.open(OUT/f'review/{stage.lower()}-front.png').convert('RGBA').resize((480,640),Image.Resampling.LANCZOS)
    canvas.alpha_composite(picture,(index*500+10,118))
    bounds=draw.textbbox((0,0),stage,font=font(31));width=bounds[2]-bounds[0]
    draw.text((index*500+(500-width)/2,757),stage,fill='#f4f2ee',font=font(31))
draw.text((44,817),'Same pose and scale. Original outfit and texture images.',fill='#bbc3cf',font=font(22))
canvas.convert('RGB').save(OUT/'comparison.png')
print(OUT/'comparison.png')
