"""Assemble review images at a shared scale within each character family."""
from pathlib import Path
import argparse
from PIL import Image, ImageDraw, ImageFont

ROOT=Path(__file__).resolve().parents[2]
STAGES=['Starter','Developing','Strong','Elite','Legendary']
COLORS=['#a99bd9','#9370ed','#ac55ed','#c32beb','#ee36a0']
BG='#100c19';CARD='#1b1428';TEXT='#f7f0ff';MUTED='#baaccf'

def font(size,bold=False):
    path=Path('C:/Windows/Fonts')/('segoeuib.ttf' if bold else 'segoeui.ttf')
    return ImageFont.truetype(str(path),size)

def frames(name):
    folder=ROOT/'resources'/f'{name.lower().replace("_","-")}-progression'
    paths=[folder/'review'/(f'{s}.png' if name=='Female_Name' else f'{s.lower()}-front.png') for s in STAGES]
    images=[Image.open(p).convert('RGBA') for p in paths]
    if len({im.size for im in images})!=1:raise RuntimeError(f'Inconsistent review framing for {name}')
    boxes=[im.getchannel('A').getbbox() for im in images]
    box=(max(0,min(b[0] for b in boxes)-20),max(0,min(b[1] for b in boxes)-20),
         min(images[0].width,max(b[2] for b in boxes)+20),min(images[0].height,max(b[3] for b in boxes)+20))
    return [im.crop(box) for im in images]

def row(canvas,name,y,cellw,bodyh,gap,pad,title):
    draw=ImageDraw.Draw(canvas)
    draw.text((pad,y),title,font=font(30,True),fill=TEXT)
    y+=52
    for i,(stage,im) in enumerate(zip(STAGES,frames(name))):
        x=pad+i*(cellw+gap)
        draw.rounded_rectangle((x,y,x+cellw,y+bodyh+86),20,fill=CARD,outline='#30213f',width=2)
        draw.line((x+24,y+24,x+cellw-24,y+24),fill=COLORS[i],width=4)
        scale=min((cellw-26)/im.width,(bodyh-26)/im.height)
        fitted=im.resize((round(im.width*scale),round(im.height*scale)),Image.Resampling.LANCZOS)
        canvas.alpha_composite(fitted,(x+(cellw-fitted.width)//2,y+35+(bodyh-fitted.height)//2))
        draw.text((x+cellw//2,y+bodyh+40),stage,font=font(24,True),fill=COLORS[i],anchor='mm')
    return y+bodyh+118

def base_comparison(name):
    pad=36;gap=16;cellw=410
    bodyh=305 if name=='Base_Male' else 730
    width=pad*2+cellw*5+gap*4
    canvas=Image.new('RGBA',(width,bodyh+310),BG)
    draw=ImageDraw.Draw(canvas)
    draw.text((pad,22),'VYRA / CHARACTER PROGRESSION',font=font(19,True),fill=MUTED)
    end=row(canvas,name,65,cellw,bodyh,gap,pad,name.replace('_',' ')+' · five physique stages')
    draw.text((pad,end+10),'Actual GLB renders · identical camera and scale across all five stages · source head, material and pose retained',font=font(19),fill=MUTED)
    output=ROOT/'resources'/f'{name.lower().replace("_","-")}-progression'/f'{name}_Progression_Comparison.png'
    canvas.convert('RGB').save(output)
    print(output)

def overview():
    pad=36;gap=14;cellw=340;width=pad*2+cellw*5+gap*4
    entries=[('Base_Male','Base Male · source rig retained',240),('Base_Female','Base Female · refined low-poly surface',510),
             ('Female_Mikasa','Mikasa · outfit and identity retained',510),('Female_Name','Nami / Female_Name · 14 original animations',510),
             ('Female_Sakura','Sakura · cleaned duplicate geometry',510)]
    height=165+sum(bodyh+170 for _,_,bodyh in entries)+55
    canvas=Image.new('RGBA',(width,height),BG);draw=ImageDraw.Draw(canvas)
    draw.text((pad,24),'VYRA / 25 NEW PROGRESSION MODELS',font=font(38,True),fill=TEXT)
    draw.text((pad,82),'Starter → Developing → Strong → Elite → Legendary',font=font(25),fill=MUTED)
    y=155
    for name,title,bodyh in entries:y=row(canvas,name,y,cellw,bodyh,gap,pad,title)
    draw.text((pad,y+10),'Actual GLB renders. Shared framing within each row; character scales and original poses differ.',font=font(19),fill=MUTED)
    output=ROOT/'resources/character-progressions-overview.png'
    canvas.convert('RGB').save(output);print(output)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--overview',action='store_true');args=parser.parse_args()
    if args.overview:overview()
    else:
        for name in ['Base_Male','Base_Female']:base_comparison(name)
