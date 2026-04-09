import type { LiveSector, MacroCategory, MacroSeverity, MacroSignal, SectorAllocation } from '@/src/global-markets/types';
import { useGlobalMarkets } from '@/src/global-markets/hooks/useGlobalMarkets';
import {
  BG, BG2 as CARD2, CARD, CARD2 as CARD3,
  BORDER,
  GOLD as CYAN, GOLD_D as CYAN_D,
  ORANGE as PINK, ORANGE_D as PINK_D,
  GREEN, GREEN_D,
  RED, RED_D,
  AMBER, AMBER_D,
  PURPLE,
  TXT, TXT2, MUTED,
  mono, sans,
} from '@/src/market/tokens';
// BORDER_HI and SUB have screen-specific values
const BORDER_HI = 'rgba(143,245,255,0.22)';
const SUB       = '#4A6090';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Linking, Platform, RefreshControl, ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Circle, Defs, G, Line, Path, Pattern } from 'react-native-svg';


const W=Dimensions.get('window').width,MAP_W=W-32,MAP_H=210;

// ─── Severity / Category maps ─────────────────────────────────────────────────
const SEV_COL:Record<MacroSeverity,string>={critical:RED,warning:AMBER,positive:GREEN,neutral:CYAN};
const SEV_BG:Record<MacroSeverity,string>={critical:RED_D,warning:AMBER_D,positive:GREEN_D,neutral:CYAN_D};
const SEV_LBL:Record<MacroSeverity,string>={critical:'CRITICAL',warning:'WARNING',positive:'POSITIVE',neutral:'INFO'};
const SEV_ICO:Record<MacroSeverity,string>={critical:'▲',warning:'◆',positive:'●',neutral:'◉'};
const CAT_LBL:Record<MacroCategory,string>={inflation:'INFLATION',rates:'RATES',yield_curve:'YIELD CURVE',sentiment:'SENTIMENT',employment:'EMPLOYMENT'};
const CAT_COL:Record<MacroCategory,string>={inflation:AMBER,rates:PURPLE,yield_curve:CYAN,sentiment:RED,employment:GREEN};

const fmt=(v:number|null,d=2,s='%')=>v===null?'—':`${v.toFixed(d)}${s}`;
const fmtP=(v:number,d=1)=>`${v>0?'+':''}${v.toFixed(d)}%`;

// ─── Animations ───────────────────────────────────────────────────────────────
function useSkPulse(){
  const a=useRef(new Animated.Value(0.20)).current;
  useEffect(()=>{
    const l=Animated.loop(Animated.sequence([
      Animated.timing(a,{toValue:0.55,duration:900,useNativeDriver:true}),
      Animated.timing(a,{toValue:0.20,duration:900,useNativeDriver:true}),
    ]));l.start();return()=>l.stop();
  },[]);return a;
}
const FadeIn:React.FC<{children:React.ReactNode;delay?:number}>=({children,delay=0})=>{
  const op=useRef(new Animated.Value(0)).current,ty=useRef(new Animated.Value(16)).current;
  useEffect(()=>{Animated.parallel([
    Animated.timing(op,{toValue:1,duration:380,delay,useNativeDriver:true}),
    Animated.timing(ty,{toValue:0,duration:380,delay,useNativeDriver:true}),
  ]).start();},[]);
  return <Animated.View style={{opacity:op,transform:[{translateY:ty}]}}>{children}</Animated.View>;
};

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const Sk:React.FC<{w?:any;h?:number;r?:number;p:Animated.Value}>=({w='100%',h=14,r=6,p})=>
  <Animated.View style={{width:w,height:h,borderRadius:r,backgroundColor:CARD2,opacity:p}}/>;
const SkScreen:React.FC<{p:Animated.Value}>=({p})=>(
  <ScrollView style={{flex:1}} contentContainerStyle={{paddingBottom:40}} scrollEnabled={false}>
    <View style={g.header}>
      <Sk w={110} h={10} p={p}/><View style={{height:12}}/>
      <Sk w="70%" h={34} r={8} p={p}/><View style={{height:6}}/><Sk w={140} h={10} p={p}/>
    </View>
    <View style={[g.statCard,{gap:12}]}><Sk w="45%" h={42} r={8} p={p}/><Sk w="45%" h={42} r={8} p={p}/></View>
    <View style={{marginHorizontal:16,marginBottom:14}}><Sk h={240} r={12} p={p}/></View>
    <View style={{paddingHorizontal:20,marginBottom:10}}><Sk w={140} h={10} p={p}/></View>
    {[0,1,2].map(i=><View key={i} style={[g.card,{gap:14}]}><Sk h={14} p={p}/><Sk w="60%" h={10} p={p}/></View>)}
  </ScrollView>
);

// ─── DIGITAL DOT MAP ─────────────────────────────────────────────────────────
// Land paths — Natural Earth simplified, 1000×500 equirectangular viewBox
const LAND=[
  "M50,55 L95,38 L155,28 L205,38 L222,48 L218,72 L198,90 L178,105 L155,102 L128,98 L98,98 L82,90 L55,70Z",
  "M20,60 L50,55 L55,70 L35,78Z",
  "M190,15 L232,18 L238,32 L220,55 L195,38Z",
  "M68,105 L158,100 L185,95 L218,128 L215,145 L192,165 L162,172 L128,165 L95,150 L70,128Z",
  "M192,165 L198,192 L188,205 L178,195 L178,170Z",
  "M90,150 L162,172 L175,180 L170,208 L145,212 L118,195 L80,148Z",
  "M148,242 L208,240 L218,260 L202,272 L165,270 L148,252Z",
  "M185,265 L252,258 L275,310 L248,348 L208,358 L175,332 L162,290Z",
  "M148,255 L162,278 L148,312 L128,290 L128,272Z",
  "M148,312 L162,355 L152,395 L138,398 L135,355Z",
  "M160,330 L185,335 L185,375 L158,420 L142,398 L145,355Z",
  "M380,125 L422,125 L428,140 L415,165 L385,162 L372,135Z",
  "M402,98 L448,100 L452,115 L428,135 L398,120Z",
  "M385,75 L410,72 L415,85 L398,102 L382,82Z",
  "M418,82 L465,88 L462,102 L425,105 L415,95Z",
  "M418,35 L465,28 L475,40 L458,68 L422,62 L415,48Z",
  "M458,28 L495,52 L480,60 L455,45Z",
  "M455,85 L505,88 L502,102 L458,105 L452,95Z",
  "M428,112 L462,132 L448,162 L428,152 L425,132Z",
  "M460,132 L492,140 L470,155 L458,148Z",
  "M488,102 L535,108 L508,128 L480,115Z",
  "M492,78 L568,80 L540,105 L494,100Z",
  "M498,35 L695,22 L752,58 L695,72 L622,72 L552,72 L488,50Z",
  "M735,25 L900,30 L905,60 L800,65 L738,38Z",
  "M895,35 L950,38 L932,65 L898,50Z",
  "M498,132 L618,128 L622,152 L565,160 L505,150Z",
  "M548,158 L592,162 L588,175 L552,180 L542,172Z",
  "M618,128 L715,160 L672,182 L618,172 L605,145Z",
  "M552,180 L662,180 L665,215 L625,232 L578,218 L558,202Z",
  "M668,122 L758,135 L728,158 L672,150Z",
  "M702,150 L782,168 L758,188 L702,178Z",
  "M568,75 L748,80 L748,112 L638,112 L568,98Z",
  "M698,175 L812,188 L798,245 L755,278 L712,268 L685,205Z",
  "M798,188 L832,208 L812,212 L798,202Z",
  "M828,182 L878,185 L858,218 L828,200Z",
  "M855,205 L908,208 L892,242 L848,218Z",
  "M888,195 L928,198 L902,250 L875,212Z",
  "M858,268 L935,262 L928,295 L865,295 L852,280Z",
  "M892,305 L965,308 L942,325 L888,315Z",
  "M912,248 L978,252 L960,282 L912,268Z",
  "M938,198 L978,198 L965,230 L938,215Z",
  "M728,82 L895,90 L892,148 L778,165 L712,115 L712,98Z",
  "M935,105 L978,100 L968,132 L932,125Z",
  "M900,110 L928,115 L910,135 L900,125Z",
  "M718,68 L862,65 L858,92 L728,90Z",
  "M385,168 L575,162 L592,188 L478,198 L372,195 L368,180Z",
  "M368,198 L512,215 L505,248 L438,270 L358,222Z",
  "M492,215 L618,222 L598,278 L518,278 L488,222Z",
  "M578,205 L678,222 L632,268 L572,240 L568,222Z",
  "M498,278 L648,292 L632,358 L548,378 L488,292Z",
  "M648,295 L682,292 L682,338 L652,348 L638,308Z",
  "M812,310 L988,332 L960,398 L862,405 L788,320Z",
  "M928,268 L995,265 L975,292 L928,282Z",
  "M330,52 L375,52 L362,72 L340,68Z",
];

// City lights [cx, cy] in 1000×500 viewBox — real population centers
const CITIES=[
  [138,148],[148,160],[155,132],[120,135],[168,155],[178,165],[155,145], // N.America
  [400,88],[415,92],[425,95],[438,85],[455,90],[445,98],[410,102],[465,75],[488,82],[498,85], // Europe
  [558,158],[572,165],[605,148],[618,152],[638,160], // Mid East
  [718,175],[748,185],[762,188],[732,178],[698,178], // S.Asia
  [808,105],[842,108],[862,120],[888,115],[898,98],[912,108],[925,118],[848,92], // E.Asia
  [872,218],[905,228],[905,268], // SE.Asia
  [488,240],[512,218],[568,228],[508,308],[542,298], // Africa
  [200,270],[175,290],[212,350],[148,280], // S.America
  [918,345],[868,368],[928,308], // Australia
] as const;

const DigitalMap:React.FC<{w:number;h:number}>=({w,h})=>(
  <Svg width={w} height={h} viewBox="0 0 1000 500" style={{position:'absolute',top:0,left:0}} pointerEvents="none">
    <Defs>
      {/* Dot grid — the core digital map texture */}
      <Pattern id="dots" x="0" y="0" width="8" height="8" patternUnits="userSpaceOnUse">
        <Circle cx="1.5" cy="1.5" r="1.1" fill="rgba(90,140,220,0.30)"/>
      </Pattern>
    </Defs>
    {/* Subtle graticule */}
    {[125,250,375].map(y=><Line key={`h${y}`} x1="0" y1={y} x2="1000" y2={y} stroke="rgba(255,255,255,0.025)" strokeWidth="1"/>)}
    {[200,400,600,800].map(x=><Line key={`v${x}`} x1={x} y1="0" x2={x} y2="500" stroke="rgba(255,255,255,0.025)" strokeWidth="1"/>)}
    <Line x1="0" y1="250" x2="1000" y2="250" stroke="rgba(0,229,255,0.05)" strokeWidth="1"/>
    {/* Land filled with dot pattern */}
    <G fill="url(#dots)" stroke="rgba(80,130,220,0.10)" strokeWidth="0.4">
      {LAND.map((d,i)=><Path key={i} d={d}/>)}
    </G>
    {/* City lights — warm amber glow dots scattered at population centers */}
    {CITIES.map(([cx,cy],i)=>(
      <G key={i}>
        <Circle cx={cx} cy={cy} r={i%3===0?4.5:3.2} fill="rgba(255,150,20,0.07)"/>
        <Circle cx={cx} cy={cy} r={i%3===0?1.8:1.3} fill={i%5===0?"rgba(255,210,80,0.92)":"rgba(255,140,30,0.78)"}/>
      </G>
    ))}
  </Svg>
);

// ─── Map node — clean glowing dot matching reference image ────────────────────
const MapNode:React.FC<{color:string;severity?:number;selected?:boolean}>=({color,severity=0,selected=false})=>{
  const r1=useRef(new Animated.Value(0)).current,r2=useRef(new Animated.Value(0)).current;
  useEffect(()=>{
    const d=severity>=2?800:severity===1?1300:2200;
    const l1=Animated.loop(Animated.timing(r1,{toValue:1,duration:d,useNativeDriver:true}));
    const l2=Animated.loop(Animated.sequence([Animated.delay(d*0.4),Animated.timing(r2,{toValue:1,duration:d,useNativeDriver:true})]));
    l1.start();l2.start();return()=>{l1.stop();l2.stop();};
  },[severity]);
  const sc=(v:Animated.Value)=>v.interpolate({inputRange:[0,1],outputRange:[1,selected?5.5:4.5]});
  const op=(v:Animated.Value)=>v.interpolate({inputRange:[0,0.45,1],outputRange:[0.9,0.3,0]});
  const D=selected?13:10;
  return (
    <View style={{width:38,height:38,alignItems:'center',justifyContent:'center'}}>
      <Animated.View style={{position:'absolute',width:D,height:D,borderRadius:D/2,borderWidth:1.5,borderColor:color,transform:[{scale:sc(r1)}],opacity:op(r1)}}/>
      <Animated.View style={{position:'absolute',width:D,height:D,borderRadius:D/2,borderWidth:1,borderColor:color,transform:[{scale:sc(r2)}],opacity:op(r2)}}/>
      {selected&&<View style={{position:'absolute',width:D*3,height:D*3,borderRadius:D*1.5,borderWidth:1,borderColor:color,opacity:0.2}}/>}
      <View style={{width:D,height:D,borderRadius:D/2,backgroundColor:color,shadowColor:color,shadowOpacity:1,shadowRadius:selected?16:10,shadowOffset:{width:0,height:0},elevation:8}}/>
    </View>
  );
};

// ─── World Map card ───────────────────────────────────────────────────────────
const WorldMap:React.FC<{macro:any;regime:any;signalCount:number}>=({macro,regime,signalCount})=>{
  const [sel,setSel]=useState<string|null>(null);
  const centers=[
    {id:'na',region:'N. AMERICA',city:'New York · Chicago',fx:0.14,fy:0.42,metric:'FED RATE',
     value:fmt(macro.fed_rate),trend:macro.fed_rate!==null?(macro.fed_rate>5?-1:macro.fed_rate<3?1:0):0,
     color:macro.fed_rate!==null?(macro.fed_rate>5?RED:macro.fed_rate>3.5?AMBER:GREEN):MUTED,
     severity:macro.fed_rate!==null?(macro.fed_rate>5.5?2:macro.fed_rate>4?1:0):0,
     detail:`Fed Funds: ${fmt(macro.fed_rate)}   CPI: ${fmt(macro.cpi_yoy)}`},
    {id:'eu',region:'EUROPE',city:'London · Frankfurt',fx:0.45,fy:0.20,metric:'YIELD SPREAD',
     value:macro.yield_spread!==null?`${macro.yield_spread>=0?'+':''}${macro.yield_spread.toFixed(2)}%`:'—',
     trend:macro.yield_spread!==null?(macro.yield_spread<0?-1:macro.yield_spread>0.5?1:0):0,
     color:macro.yield_spread!==null?(macro.yield_spread<0?RED:macro.yield_spread>0.5?GREEN:AMBER):MUTED,
     severity:macro.yield_spread!==null?(macro.yield_spread<-0.5?2:macro.yield_spread<0?1:0):0,
     detail:`10Y–2Y: ${macro.yield_spread!==null?`${macro.yield_spread.toFixed(2)}%`:'—'}   10Y: ${fmt(macro.yield_10y)}`},
    {id:'mena',region:'MENA',city:'Dubai · Riyadh',fx:0.60,fy:0.44,metric:'INFLATION',
     value:fmt(macro.cpi_yoy),trend:macro.cpi_yoy!==null?(macro.cpi_yoy>4?-1:macro.cpi_yoy<2?1:0):0,
     color:macro.cpi_yoy!==null?(macro.cpi_yoy>4?RED:macro.cpi_yoy<2?AMBER:GREEN):MUTED,
     severity:macro.cpi_yoy!==null?(macro.cpi_yoy>5?2:macro.cpi_yoy>3?1:0):0,
     detail:`CPI YoY: ${fmt(macro.cpi_yoy)}   Status: ${macro.cpi_yoy!==null?(macro.cpi_yoy>4?'High':macro.cpi_yoy>2.5?'Elevated':'Stable'):'—'}`},
    {id:'apac',region:'ASIA PAC',city:'Tokyo · Shanghai · Singapore',fx:0.88,fy:0.28,metric:'VIX INDEX',
     value:fmt(macro.vix,2,''),trend:macro.vix!==null?(macro.vix>25?-1:macro.vix<15?1:0):0,
     color:macro.vix!==null?(macro.vix>30?RED:macro.vix>20?AMBER:GREEN):MUTED,
     severity:macro.vix!==null?(macro.vix>30?2:macro.vix>20?1:0):0,
     detail:`VIX: ${macro.vix!==null?macro.vix.toFixed(2):'—'}   Sentiment: ${macro.vix!==null?(macro.vix>25?'Risk-Off':macro.vix<15?'Risk-On':'Neutral'):'—'}`},
    {id:'latam',region:'S. AMERICA',city:'São Paulo · Santiago',fx:0.21,fy:0.70,metric:'EMPLOYMENT',
     value:fmt(macro.unemployment),trend:macro.unemployment!==null?(macro.unemployment>5?-1:macro.unemployment<3.5?0:1):0,
     color:macro.unemployment!==null?(macro.unemployment>5.5?RED:macro.unemployment<3.5?AMBER:GREEN):MUTED,
     severity:macro.unemployment!==null?(macro.unemployment>5.5?2:0):0,
     detail:`Unemployment: ${fmt(macro.unemployment)}   ${macro.unemployment!==null?(macro.unemployment>5.5?'Elevated':macro.unemployment<3.5?'Tight':'Stable'):'—'}`},
    {id:'af',region:'AFRICA',city:'Johannesburg · Nairobi',fx:0.52,fy:0.62,metric:'COMMODITIES',value:'—',trend:0,color:MUTED,severity:0,detail:'Emerging market data from FRED proxies.'},
  ];
  const active=centers.find(c=>c.id===sel)??null;
  const rc=regime.color??CYAN;
  const conns=[[0,1],[1,2],[2,3],[0,4],[1,5],[2,5]] as const;
  return (
    <View style={g.mapCard}>
      <View style={{height:MAP_H,position:'relative',overflow:'hidden',borderRadius:10}}>
        <DigitalMap w={MAP_W} h={MAP_H}/>
        <Svg width={MAP_W} height={MAP_H} style={{position:'absolute',top:0,left:0}} pointerEvents="none">
          {conns.map(([a,b],i)=>(
            <Line key={i} x1={centers[a].fx*MAP_W} y1={centers[a].fy*MAP_H} x2={centers[b].fx*MAP_W} y2={centers[b].fy*MAP_H} stroke="rgba(0,229,255,0.12)" strokeWidth="0.7" strokeDasharray="3 5"/>
          ))}
        </Svg>
        {centers.map(c=>{
          const px=c.fx*MAP_W-19,py=c.fy*MAP_H-19,lr=c.fx>0.75,lb=c.fy<0.25;
          return (
            <React.Fragment key={c.id}>
              <TouchableOpacity style={{position:'absolute',left:px,top:py}} onPress={()=>setSel(sel===c.id?null:c.id)} activeOpacity={0.8} hitSlop={{top:12,bottom:12,left:12,right:12}}>
                <MapNode color={c.color} severity={c.severity} selected={sel===c.id}/>
              </TouchableOpacity>
              <View pointerEvents="none" style={{position:'absolute',left:lr?undefined:c.fx*MAP_W+21,right:lr?MAP_W-c.fx*MAP_W+21:undefined,top:lb?c.fy*MAP_H+21:c.fy*MAP_H-15}}>
                <Text style={{color:c.color,fontSize:6.5,fontFamily:mono,fontWeight:'800',letterSpacing:0.8}}>{c.region}</Text>
                <Text style={{color:TXT2,fontSize:6,fontFamily:mono,marginTop:1.5,opacity:0.85}}>{c.value}{'  '}{c.trend===1?'↑':c.trend===-1?'↓':'→'}</Text>
              </View>
            </React.Fragment>
          );
        })}
        <View style={{position:'absolute',bottom:8,left:8,flexDirection:'row',alignItems:'center',gap:5,backgroundColor:`${rc}12`,borderWidth:1,borderColor:`${rc}28`,paddingHorizontal:8,paddingVertical:4,borderRadius:4}}>
          <View style={{width:4,height:4,borderRadius:2,backgroundColor:rc}}/>
          <Text style={{color:rc,fontSize:7.5,fontFamily:mono,fontWeight:'800',letterSpacing:1.2}}>{regime.label?.toUpperCase()??'ANALYSING'}</Text>
        </View>
        <View style={{position:'absolute',bottom:8,right:8,backgroundColor:'rgba(0,0,0,0.55)',borderWidth:1,borderColor:BORDER,paddingHorizontal:6,paddingVertical:3,borderRadius:3}}>
          <Text style={{color:MUTED,fontSize:6.5,fontFamily:mono,letterSpacing:0.5}}>DIGITAL · NE 1:110M</Text>
        </View>
      </View>
      <View style={g.mapFoot}>
        <View>
          <Text style={g.mapFootSub}>SIGNAL DENSITY</Text>
          <Text style={g.mapFootMain}><Text style={{color:CYAN}}>{signalCount.toLocaleString()}</Text><Text style={{color:MUTED,fontSize:12,fontFamily:mono}}>{'  '}ACTIVE NODES</Text></Text>
        </View>
        <View style={{flexDirection:'row',gap:10,alignItems:'center'}}>
          {([[GREEN,'STABLE'],[AMBER,'CAUTION'],[RED,'RISK']] as const).map(([col,lbl])=>(
            <View key={lbl} style={{flexDirection:'row',alignItems:'center',gap:4}}>
              <View style={{width:4,height:4,borderRadius:2,backgroundColor:col,opacity:0.9}}/>
              <Text style={{color:MUTED,fontSize:6.5,fontFamily:mono,letterSpacing:0.5}}>{lbl}</Text>
            </View>
          ))}
        </View>
      </View>
      {active&&(
        <View style={[g.nodePanel,{borderColor:`${active.color}20`}]}>
          <View style={g.nodePanelHead}>
            <View style={{width:3,backgroundColor:active.color,borderRadius:2,marginRight:12,minHeight:32}}/>
            <View style={{flex:1}}>
              <Text style={[g.nodePanelReg,{color:active.color}]}>{active.region}</Text>
              <Text style={g.nodePanelCity}>{active.city}</Text>
            </View>
            <TouchableOpacity onPress={()=>setSel(null)} hitSlop={{top:10,bottom:10,left:10,right:10}}>
              <Text style={{color:MUTED,fontSize:18,lineHeight:22}}>×</Text>
            </TouchableOpacity>
          </View>
          <View style={g.nodePanelMetrics}>
            {[{lbl:active.metric,val:active.value},{lbl:'TREND',val:active.trend===1?'↑ UPWARD':active.trend===-1?'↓ DOWNWARD':'→ NEUTRAL'},{lbl:'RISK LEVEL',val:active.severity===2?'CRITICAL':active.severity===1?'ELEVATED':'STABLE'}].map((m,i)=>(
              <React.Fragment key={m.lbl}>
                {i>0&&<View style={g.npDiv}/>}
                <View style={g.npMetric}>
                  <Text style={g.npMetLbl}>{m.lbl}</Text>
                  <Text style={[g.npMetVal,{color:active.color}]}>{m.val}</Text>
                </View>
              </React.Fragment>
            ))}
          </View>
          <View style={[g.npDetailBox,{borderColor:`${active.color}18`}]}>
            <Text style={g.npDetail}>{active.detail}</Text>
          </View>
        </View>
      )}
    </View>
  );
};

// ─── Shared UI ────────────────────────────────────────────────────────────────
const Div=()=><View style={g.divider}/>;
const SLabel:React.FC<{title:string;right?:string}>=({title,right})=>(
  <View style={g.sLabel}>
    <View style={g.sLabelL}><View style={g.sAcc}/><Text style={g.sLabelTxt}>{title}</Text></View>
    {right&&<Text style={g.sLabelR}>{right}</Text>}
  </View>
);
const DataRow:React.FC<{label:string;sub?:string;value:string;change:number|null;color?:string}>=({label,sub,value,change,color=TXT})=>(
  <View style={g.dataRow}>
    <View style={{flex:1}}><Text style={g.dataLbl}>{label}</Text>{sub&&<Text style={g.dataSub}>{sub}</Text>}</View>
    <View style={{alignItems:'flex-end'}}>
      <Text style={[g.dataVal,{color}]}>{value}</Text>
      {change!==null&&<Text style={[g.dataChg,{color:change>=0?GREEN:RED}]}>{fmtP(change)}{'  '}{change>=0?'↑':'↓'}</Text>}
    </View>
  </View>
);
const IdxRow:React.FC<{name:string;sub:string;value:string;color:string;badge:string;badgeColor:string}>=({name,sub,value,color,badge,badgeColor})=>(
  <View style={g.idxRow}>
    <View style={{flex:1}}><Text style={g.idxName}>{name}</Text><Text style={g.idxSub}>{sub}</Text></View>
    <View style={{alignItems:'flex-end',gap:5}}>
      <Text style={[g.idxVal,{color}]}>{value}</Text>
      <View style={[g.idxBadge,{backgroundColor:`${badgeColor}14`,borderColor:`${badgeColor}26`}]}><Text style={[g.idxBadgeTxt,{color:badgeColor}]}>{badge}</Text></View>
    </View>
  </View>
);
const YieldBars:React.FC<{yield2y:number|null;yield10y:number|null;spread:number|null}>=({yield2y,yield10y,spread})=>{
  const max=Math.max(yield2y??0,yield10y??0,0.01)+0.5;
  const w2=yield2y?`${Math.min((yield2y/max)*82,82)}%` as any:'0%';
  const w10=yield10y?`${Math.min((yield10y/max)*82,82)}%` as any:'0%';
  const inv=spread!==null&&spread<0;
  const sc=inv?(spread!<-0.5?RED:AMBER):(spread!>1?GREEN:TXT2);
  const st=spread===null?'N/A':spread<-0.5?'DEEPLY INVERTED':spread<0?'INVERTED':spread<0.5?'FLAT':'NORMAL';
  return (
    <View style={g.card}>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:18}}>
        <View style={g.sLabelL}><View style={g.sAcc}/><Text style={g.sLabelTxt}>YIELD CURVE</Text></View>
        <View style={[g.statusPill,{backgroundColor:`${sc}12`,borderColor:`${sc}26`}]}><Text style={[g.statusPillTxt,{color:sc}]}>{st}</Text></View>
      </View>
      {[{lbl:'2Y',w:w2,col:PURPLE,val:fmt(yield2y)},{lbl:'10Y',w:w10,col:CYAN,val:fmt(yield10y)}].map(r=>(
        <View key={r.lbl} style={[g.yRow,{marginBottom:14}]}>
          <Text style={g.yTerm}>{r.lbl}</Text>
          <View style={g.yTrack}>
            {[0.25,0.5,0.75].map(f=><View key={f} style={{position:'absolute',left:`${f*100}%` as any,top:0,bottom:0,width:1,backgroundColor:'rgba(255,255,255,0.05)'}}/>)}
            <View style={[g.yFill,{width:r.w,backgroundColor:r.col}]}/>
          </View>
          <Text style={[g.yVal,{color:r.col}]}>{r.val}</Text>
        </View>
      ))}
      <Div/>
      <View style={{flexDirection:'row',justifyContent:'space-between',alignItems:'center'}}>
        <Text style={g.dataSub}>10Y – 2Y SPREAD</Text>
        <Text style={[g.idxVal,{color:sc}]}>{spread!==null?`${spread>=0?'+':''}${spread.toFixed(2)}%`:'—'}</Text>
      </View>
      {inv&&<View style={[g.warnBox,{borderColor:`${RED}20`,backgroundColor:RED_D,marginTop:12}]}><Text style={[g.warnTxt,{color:RED}]}>⚠{'  '}Inverted yield curves have preceded every US recession since 1955 (lead: 12–18 months)</Text></View>}
    </View>
  );
};
const SignalCard:React.FC<{signal:MacroSignal}>=({signal})=>{
  const col=SEV_COL[signal.severity],bg=SEV_BG[signal.severity],catCol=CAT_COL[signal.category];
  return (
    <View style={[g.sigCard,{borderLeftColor:col}]}>
      <View style={g.sigTop}>
        <Text style={[g.sevIco,{color:col}]}>{SEV_ICO[signal.severity]}</Text>
        <View style={[g.badge,{backgroundColor:`${catCol}16`}]}><Text style={[g.badgeTxt,{color:catCol}]}>{CAT_LBL[signal.category]}</Text></View>
        <View style={[g.badge,{backgroundColor:bg}]}><Text style={[g.badgeTxt,{color:col}]}>{SEV_LBL[signal.severity]}</Text></View>
        <View style={[g.valPill,{borderColor:`${col}32`,marginLeft:'auto' as any}]}><Text style={[g.valPillTxt,{color:col}]}>{signal.value}</Text></View>
      </View>
      <Text style={g.sigTitle}>{signal.title}</Text>
      <Text style={g.sigBody}>{signal.body}</Text>
      <View style={[g.tacticBox,{borderColor:`${CYAN}16`,backgroundColor:CYAN_D}]}>
        <Text style={[g.tacticLbl,{color:CYAN}]}>TACTIC{'  '}</Text>
        <Text style={g.tacticTxt}>{signal.action}</Text>
      </View>
    </View>
  );
};
const SectorRow:React.FC<{sector:LiveSector;maxAbs:number}>=({sector,maxAbs})=>{
  const col=sector.changePct>=0?GREEN:RED;
  return (
    <View style={g.secRow}>
      <Text style={g.secName}>{sector.name}</Text>
      <View style={g.secTrack}><View style={[g.secFill,{width:maxAbs>0?`${Math.round((Math.abs(sector.changePct)/maxAbs)*100)}%` as any:'0%',backgroundColor:col}]}/></View>
      <Text style={[g.secPct,{color:col}]}>{fmtP(sector.changePct)}</Text>
    </View>
  );
};
const RegimeBlock:React.FC<{label:string;description:string;color:string;equityStance:string;bondStance:string;strategy:string;overweight:SectorAllocation[];underweight:SectorAllocation[];keyEtfs:string[]}>=
({label,description,color,equityStance,bondStance,strategy,overweight,underweight,keyEtfs})=>(
  <View style={[g.card,{borderLeftWidth:3,borderLeftColor:color,borderRadius:0,borderTopRightRadius:6,borderBottomRightRadius:6}]}>
    <View style={{flexDirection:'row',alignItems:'center',gap:8,marginBottom:12}}>
      <View style={{width:6,height:6,borderRadius:3,backgroundColor:color}}/><Text style={[g.badgeTxt,{color,letterSpacing:2}]}>MACRO REGIME</Text>
    </View>
    <Text style={g.regName}>{label}</Text><Text style={g.regDesc}>{description}</Text>
    <View style={{flexDirection:'row',marginBottom:16}}>
      {[{lbl:'EQUITIES',val:equityStance,col:equityStance.includes('Over')?GREEN:equityStance.includes('Under')||equityStance==='Defensive'?RED:AMBER},
        {lbl:'FIXED INCOME',val:bondStance,col:bondStance.includes('Under')||bondStance==='Reduce'?RED:bondStance.includes('Over')||bondStance==='Long Duration'?GREEN:AMBER}
      ].map((item,i)=>(
        <React.Fragment key={item.lbl}>
          {i>0&&<View style={{width:1,backgroundColor:'rgba(255,255,255,0.08)',marginHorizontal:16,alignSelf:'stretch'}}/>}
          <View style={{flex:1}}><Text style={g.dataSub}>{item.lbl}</Text><Text style={[g.idxVal,{color:item.col,marginTop:5}]}>{item.val}</Text></View>
        </React.Fragment>
      ))}
    </View>
    <View style={[g.stratBox,{borderColor:`${color}20`,backgroundColor:`${color}06`}]}>
      <Text style={[g.tacticLbl,{color}]}>STRATEGY{'  '}</Text><Text style={g.tacticTxt}>{strategy}</Text>
    </View>
    <Div/>
    {overweight.length>0&&<><Text style={[g.rotLbl,{color:GREEN}]}>OVERWEIGHT</Text>{overweight.map(s=><View key={s.etf} style={g.rotRow}><View style={[g.rotDot,{backgroundColor:GREEN}]}/><Text style={g.rotName}>{s.name}</Text><View style={[g.etfTag,{backgroundColor:GREEN_D,borderColor:`${GREEN}25`}]}><Text style={[g.etfTagTxt,{color:GREEN}]}>{s.etf}</Text></View></View>)}</>}
    {underweight.length>0&&<><View style={{height:12}}/><Text style={[g.rotLbl,{color:RED}]}>UNDERWEIGHT</Text>{underweight.map(s=><View key={s.etf} style={g.rotRow}><View style={[g.rotDot,{backgroundColor:RED}]}/><Text style={g.rotName}>{s.name}</Text><View style={[g.etfTag,{backgroundColor:RED_D,borderColor:`${RED}25`}]}><Text style={[g.etfTagTxt,{color:RED}]}>{s.etf}</Text></View></View>)}</>}
    <View style={{height:14}}/><Text style={g.rotLbl}>TACTICAL ETFs</Text>
    <View style={g.etfChipRow}>{keyEtfs.map(e=><View key={e} style={g.etfChip}><Text style={g.etfChipTxt}>{e}</Text></View>)}</View>
  </View>
);
const SetupScreen=()=>(
  <View style={g.setupWrap}>
    <Text style={g.setupIcon}>🌐</Text><Text style={g.setupTitle}>Setup Required</Text>
    <Text style={g.setupBody}>The Global Intelligence screen requires a free FRED API key from the Federal Reserve Bank of St. Louis.</Text>
    <View style={{width:'100%',gap:8,marginBottom:28}}>
      {['1. Visit fred.stlouisfed.org and create a free account','2. Generate your API key under "My Account"','3. Run: npx supabase secrets set FRED_API_KEY=your_key','4. Run: npx supabase functions deploy market-intelligence'].map((s,i)=><Text key={i} style={g.setupStep}>{s}</Text>)}
    </View>
    <TouchableOpacity style={g.ctaBtn} onPress={()=>Linking.openURL('https://fred.stlouisfed.org/docs/api/api_key.html')}><Text style={g.ctaBtnTxt}>Get Free FRED API Key →</Text></TouchableOpacity>
  </View>
);

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function GlobalMarketsScreen(){
  const {intelligence,sectors,loading,refreshing,error,needsSetup,onRefresh}=useGlobalMarkets();
  const [sigTab,setSigTab]=useState<'all'|'critical'|'positive'>('all');
  const skP=useSkPulse();
  if(loading) return <View style={g.root}><StatusBar barStyle="light-content" backgroundColor={BG}/><SkScreen p={skP}/></View>;
  if(needsSetup) return <View style={g.root}><StatusBar barStyle="light-content" backgroundColor={BG}/><View style={g.header}><Text style={g.liveTxt}>LIVE ENVIRONMENT</Text><Text style={g.hTitle}>Global Markets{'\n'}Overview</Text></View><SetupScreen/></View>;
  if(error&&!intelligence) return <View style={[g.root,{alignItems:'center',justifyContent:'center',padding:28}]}><StatusBar barStyle="light-content" backgroundColor={BG}/><Text style={[g.setupTitle,{color:RED}]}>Failed to Load</Text><Text style={g.setupBody}>{error}</Text><TouchableOpacity style={g.ctaBtn} onPress={onRefresh}><Text style={g.ctaBtnTxt}>RETRY</Text></TouchableOpacity></View>;
  if(!intelligence) return null;
  const {macro,regime,signals}=intelligence;
  const maxAbs=sectors.reduce((m,s)=>Math.max(m,Math.abs(s.changePct)),0);
  const filtered=signals.filter(s=>sigTab==='all'?true:sigTab==='critical'?(s.severity==='critical'||s.severity==='warning'):(s.severity==='positive'||s.severity==='neutral'));
  const crit=signals.filter(s=>s.severity==='critical').length,warn=signals.filter(s=>s.severity==='warning').length,pos=signals.filter(s=>s.severity==='positive').length;
  const genDate=new Date(intelligence.fetched_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
  const vixCol=macro.vix===null?MUTED:macro.vix>30?RED:macro.vix>20?AMBER:macro.vix<13?CYAN:GREEN;
  const sentCol=regime.color??CYAN;
  const activeNodes=Math.round((signals.length*185)+(sectors.length*54)+820+(macro.vix??20)*11);
  return (
    <View style={g.root}>
      <StatusBar barStyle="light-content" backgroundColor={BG}/>
      <ScrollView style={g.scroll} contentContainerStyle={g.scrollContent} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CYAN} colors={[CYAN]}/>}>
        <FadeIn delay={0}>
          <View style={g.header}>
            <View style={g.hTop}>
              <View style={g.liveRow}><View style={g.liveDot}/><Text style={g.liveTxt}>LIVE · GLOBAL INTELLIGENCE</Text></View>
              <TouchableOpacity style={g.iconBtn} onPress={onRefresh} disabled={refreshing}><Text style={{color:TXT2,fontSize:15}}>↺</Text></TouchableOpacity>
            </View>
            <Text style={g.hTitle}>Global Markets{'\n'}Overview</Text>
            <View style={{flexDirection:'row',alignItems:'center',gap:8,marginTop:4}}>
              <View style={{width:1,height:10,backgroundColor:BORDER_HI}}/>
              <Text style={g.hSub}>{intelligence.cached?`CACHED · ${intelligence.cache_age_min}m AGO`:`UPDATED · ${genDate.toUpperCase()}`}</Text>
            </View>
          </View>
        </FadeIn>
        <FadeIn delay={55}>
          <View style={g.statCard}>
            <View style={g.statHalf}><Text style={g.statLbl}>MARKET REGIME</Text><Text style={[g.statVal,{color:sentCol}]} numberOfLines={1} adjustsFontSizeToFit>{regime.label?.toUpperCase()??'—'}</Text></View>
            <View style={g.statDiv}/>
            <View style={[g.statHalf,{alignItems:'flex-end'}]}><Text style={g.statLbl}>VOLATILITY INDEX</Text><Text style={[g.statVal,{color:vixCol}]}>{macro.vix!==null?`${macro.vix.toFixed(1)} VIX`:'— VIX'}</Text></View>
          </View>
        </FadeIn>
        <FadeIn delay={110}><WorldMap macro={macro} regime={regime} signalCount={activeNodes}/></FadeIn>
        <FadeIn delay={165}>
          <SLabel title="ECONOMIC INDICATORS" right="FRED · Federal Reserve"/>
          <View style={g.card}>
            <DataRow label="CPI INFLATION" sub="Year-over-Year" value={fmt(macro.cpi_yoy)} change={macro.cpi_yoy} color={macro.cpi_yoy===null?MUTED:macro.cpi_yoy>4?RED:macro.cpi_yoy>2.5?AMBER:GREEN}/>
            <View style={g.rowDiv}/>
            <DataRow label="FED FUNDS RATE" sub="Current Target" value={fmt(macro.fed_rate)} change={null} color={macro.fed_rate===null?MUTED:macro.fed_rate>5?RED:macro.fed_rate>3.5?AMBER:GREEN}/>
            <View style={g.rowDiv}/>
            <DataRow label="UNEMPLOYMENT" sub="US Rate" value={fmt(macro.unemployment)} change={null} color={macro.unemployment===null?MUTED:macro.unemployment>5.5?RED:macro.unemployment<3.5?AMBER:GREEN}/>
          </View>
        </FadeIn>
        <FadeIn delay={220}>
          <SLabel title="TREASURY YIELDS" right="Commodity Proxy"/>
          <View style={g.card}>
            <DataRow label="10Y TREASURY" sub="Long-Term Yield" value={fmt(macro.yield_10y)} change={macro.yield_10y!==null?macro.yield_10y-4.0:null} color={macro.yield_10y===null?MUTED:macro.yield_10y>5?RED:macro.yield_10y>4?AMBER:CYAN}/>
            <View style={g.rowDiv}/>
            <DataRow label="2Y TREASURY" sub="Short-Term Yield" value={fmt(macro.yield_2y)} change={macro.yield_2y!==null?macro.yield_2y-4.5:null} color={macro.yield_2y===null?MUTED:macro.yield_2y>5?RED:macro.yield_2y>4?AMBER:PURPLE}/>
          </View>
        </FadeIn>
        <FadeIn delay={275}>
          <SLabel title="BENCHMARK INDICES"/>
          <View style={g.card}>
            <IdxRow name="VIX FEAR INDEX" sub="US VOLATILITY" value={macro.vix!==null?macro.vix.toFixed(2):'—'} color={vixCol} badge={macro.vix===null?'N/A':macro.vix>35?'EXTREME FEAR':macro.vix>25?'FEAR':macro.vix<13?'COMPLACENCY':'NORMAL'} badgeColor={vixCol}/>
            <View style={g.rowDiv}/>
            <IdxRow name="FED FUNDS RATE" sub="US POLICY RATE" value={macro.fed_rate!==null?`${macro.fed_rate.toFixed(2)}%`:'—'} color={macro.fed_rate===null?MUTED:macro.fed_rate>5?RED:macro.fed_rate>3.5?AMBER:GREEN} badge={macro.fed_rate===null?'N/A':macro.fed_rate>5?'RESTRICTIVE':macro.fed_rate>3.5?'ELEVATED':'ACCOMMODATIVE'} badgeColor={macro.fed_rate===null?MUTED:macro.fed_rate>5?RED:macro.fed_rate>3.5?AMBER:GREEN}/>
            <View style={g.rowDiv}/>
            <IdxRow name="CPI INFLATION" sub="US CONSUMER PRICES" value={macro.cpi_yoy!==null?`${macro.cpi_yoy.toFixed(2)}%`:'—'} color={macro.cpi_yoy===null?MUTED:macro.cpi_yoy>4?RED:macro.cpi_yoy>2.5?AMBER:GREEN} badge={macro.cpi_yoy===null?'N/A':macro.cpi_yoy>5?'HIGH':macro.cpi_yoy>3?'ELEVATED':'TARGET'} badgeColor={macro.cpi_yoy===null?MUTED:macro.cpi_yoy>4?RED:macro.cpi_yoy>2.5?AMBER:GREEN}/>
            <View style={g.rowDiv}/>
            <IdxRow name="UNEMPLOYMENT" sub="US JOBS MARKET" value={macro.unemployment!==null?`${macro.unemployment.toFixed(2)}%`:'—'} color={macro.unemployment===null?MUTED:macro.unemployment>5.5?RED:macro.unemployment<3.5?AMBER:GREEN} badge={macro.unemployment===null?'N/A':macro.unemployment>5.5?'ELEVATED':macro.unemployment<3.5?'TIGHT':'STABLE'} badgeColor={macro.unemployment===null?MUTED:macro.unemployment>5.5?RED:macro.unemployment<3.5?AMBER:GREEN}/>
          </View>
        </FadeIn>
        <FadeIn delay={330}><SLabel title="YIELD CURVE" right="Recession Indicator"/><YieldBars yield2y={macro.yield_2y} yield10y={macro.yield_10y} spread={macro.yield_spread}/></FadeIn>
        <FadeIn delay={385}>
          <TouchableOpacity style={g.ctaBtn} onPress={onRefresh} disabled={refreshing} activeOpacity={0.82}>
            <View style={{flexDirection:'row',alignItems:'center',gap:10}}><Text style={g.ctaBtnTxt}>EXECUTE COMPLEX ANALYSIS</Text><Text style={[g.ctaBtnTxt,{opacity:0.7}]}>→</Text></View>
          </TouchableOpacity>
        </FadeIn>
        <FadeIn delay={440}>
          <SLabel title="MARKET ALERTS" right={`${signals.length} SIGNALS`}/>
          <View style={g.tabs}>
            {([['all',`ALL  ${signals.length}`],['critical',`RISK  ${crit+warn}`],['positive',`POSITIVE  ${pos}`]] as const).map(([tab,label])=>(
              <TouchableOpacity key={tab} style={[g.tab,sigTab===tab&&g.tabActive]} onPress={()=>setSigTab(tab)}><Text style={[g.tabTxt,sigTab===tab&&g.tabTxtActive]}>{label}</Text></TouchableOpacity>
            ))}
          </View>
          {filtered.length===0
            ?<View style={[g.card,{alignItems:'center',paddingVertical:28}]}><Text style={{color:MUTED,fontFamily:mono,fontSize:11,letterSpacing:1}}>No {sigTab==='critical'?'risk':'positive'} signals detected.</Text></View>
            :filtered.map(s=><SignalCard key={s.id} signal={s}/>)}
        </FadeIn>
        <FadeIn delay={495}>
          <SLabel title="REGIME & SECTOR ROTATION" right={regime.label}/>
          <RegimeBlock label={regime.label} description={regime.description} color={regime.color} equityStance={regime.equity_stance} bondStance={regime.bond_stance} strategy={regime.strategy} overweight={regime.overweight} underweight={regime.underweight} keyEtfs={regime.key_etfs}/>
        </FadeIn>
        {sectors.length>0&&(
          <FadeIn delay={550}>
            <SLabel title="LIVE SECTOR PERFORMANCE" right="Today"/>
            <View style={g.card}>{sectors.map((sec,i)=><React.Fragment key={sec.etf}><SectorRow sector={sec} maxAbs={maxAbs}/>{i<sectors.length-1&&<View style={g.rowDiv}/>}</React.Fragment>)}</View>
          </FadeIn>
        )}
        <Text style={g.disclaimer}>Macro data sourced from FRED (Federal Reserve Bank of St. Louis) · Market data via Yahoo Finance · Rule-based signal analysis — not financial advice</Text>
        <View style={{height:48}}/>
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const g=StyleSheet.create({
  root:{flex:1,backgroundColor:BG},scroll:{flex:1},scrollContent:{paddingBottom:24},
  header:{paddingHorizontal:22,paddingTop:Platform.OS==='ios'?62:32,paddingBottom:20},
  hTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:20},
  liveRow:{flexDirection:'row',alignItems:'center',gap:7},
  liveDot:{width:6,height:6,borderRadius:3,backgroundColor:CYAN,shadowColor:CYAN,shadowOpacity:1,shadowRadius:10,shadowOffset:{width:0,height:0}},
  liveTxt:{color:CYAN,fontSize:9.5,fontFamily:mono,fontWeight:'800',letterSpacing:2.5},
  hTitle:{color:TXT,fontSize:34,fontFamily:sans,fontWeight:'800',letterSpacing:-1.2,lineHeight:40},
  hSub:{color:MUTED,fontSize:9,fontFamily:mono,letterSpacing:1.5},
  iconBtn:{width:32,height:32,borderRadius:4,borderWidth:1,borderColor:BORDER_HI,backgroundColor:CARD2,alignItems:'center',justifyContent:'center',shadowColor:CYAN,shadowOpacity:0.12,shadowRadius:8,shadowOffset:{width:0,height:0}},
  statCard:{flexDirection:'row',backgroundColor:CARD,borderRadius:6,borderWidth:1,borderColor:BORDER,borderTopColor:BORDER_HI,borderTopWidth:1,marginHorizontal:16,marginBottom:12,padding:18,shadowColor:CYAN,shadowOpacity:0.06,shadowRadius:12,shadowOffset:{width:0,height:0}},
  statHalf:{flex:1},statDiv:{width:1,minHeight:40,backgroundColor:BORDER_HI,marginHorizontal:16},
  statLbl:{color:MUTED,fontSize:7.5,fontFamily:mono,letterSpacing:1.5,marginBottom:7},
  statVal:{fontSize:14,fontFamily:mono,fontWeight:'800',letterSpacing:0.3},
  mapCard:{backgroundColor:CARD,borderRadius:6,borderWidth:1,borderColor:BORDER,borderTopColor:BORDER_HI,borderTopWidth:1,marginHorizontal:16,marginBottom:12,overflow:'hidden',shadowColor:CYAN,shadowOpacity:0.06,shadowRadius:14,shadowOffset:{width:0,height:0}},
  mapFoot:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:14,paddingVertical:12,borderTopWidth:1,borderTopColor:BORDER},
  mapFootSub:{color:MUTED,fontSize:7.5,fontFamily:mono,letterSpacing:1.5,marginBottom:3},
  mapFootMain:{fontSize:18,fontFamily:sans,fontWeight:'700',color:TXT},
  nodePanel:{borderTopWidth:1,borderTopColor:BORDER,backgroundColor:CARD2,padding:14},
  nodePanelHead:{flexDirection:'row',alignItems:'center',marginBottom:12},
  nodePanelReg:{fontSize:10.5,fontFamily:mono,fontWeight:'800',letterSpacing:1.5},
  nodePanelCity:{color:MUTED,fontSize:8.5,fontFamily:mono,marginTop:2},
  nodePanelMetrics:{flexDirection:'row',marginBottom:10},
  npDiv:{width:1,backgroundColor:BORDER,marginHorizontal:10},
  npMetric:{flex:1},npMetLbl:{color:MUTED,fontSize:7.5,fontFamily:mono,letterSpacing:1.5,marginBottom:5},
  npMetVal:{fontSize:12,fontFamily:mono,fontWeight:'800'},
  npDetailBox:{borderWidth:1,borderRadius:6,padding:9,backgroundColor:'rgba(255,255,255,0.02)'},
  npDetail:{color:TXT2,fontSize:10.5,fontFamily:sans,lineHeight:16},
  sLabel:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:18,marginBottom:8,marginTop:8},
  sLabelL:{flexDirection:'row',alignItems:'center',gap:8},
  sAcc:{width:3,height:12,backgroundColor:CYAN,borderRadius:1,shadowColor:CYAN,shadowOpacity:0.8,shadowRadius:6,shadowOffset:{width:0,height:0}},
  sLabelTxt:{color:TXT2,fontSize:9.5,fontFamily:mono,letterSpacing:2,fontWeight:'700'},
  sLabelR:{color:MUTED,fontSize:9,fontFamily:mono,letterSpacing:0.5},
  card:{backgroundColor:CARD,borderRadius:6,borderWidth:1,borderColor:BORDER,borderTopColor:BORDER_HI,borderTopWidth:1,marginHorizontal:16,marginBottom:12,padding:16,shadowColor:CYAN,shadowOpacity:0.05,shadowRadius:10,shadowOffset:{width:0,height:0}},
  dataRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingVertical:4},
  dataLbl:{color:TXT,fontSize:13.5,fontFamily:sans,fontWeight:'600'},
  dataSub:{color:MUTED,fontSize:8.5,fontFamily:mono,marginTop:2,letterSpacing:0.3},
  dataVal:{fontSize:15,fontFamily:mono,fontWeight:'700'},dataChg:{fontSize:10,fontFamily:mono,marginTop:2},
  rowDiv:{height:1,backgroundColor:'rgba(65,72,87,0.6)',marginVertical:10},
  divider:{height:1,backgroundColor:'rgba(65,72,87,0.6)',marginVertical:12},
  idxRow:{flexDirection:'row',alignItems:'center',paddingVertical:9},
  idxName:{color:TXT,fontSize:13,fontFamily:sans,fontWeight:'700'},
  idxSub:{color:MUTED,fontSize:8.5,fontFamily:mono,letterSpacing:0.5,marginTop:2},
  idxVal:{fontSize:16,fontFamily:mono,fontWeight:'800'},
  idxBadge:{paddingHorizontal:7,paddingVertical:3,borderRadius:3,borderWidth:1},
  idxBadgeTxt:{fontSize:7.5,fontFamily:mono,fontWeight:'800',letterSpacing:1},
  statusPill:{paddingHorizontal:8,paddingVertical:3,borderRadius:3,borderWidth:1},
  statusPillTxt:{fontSize:7.5,fontFamily:mono,fontWeight:'800',letterSpacing:1},
  yRow:{flexDirection:'row',alignItems:'center',gap:10},
  yTerm:{color:MUTED,fontSize:10.5,fontFamily:mono,width:28,letterSpacing:1},
  yTrack:{flex:1,height:7,backgroundColor:CARD3,borderRadius:3.5,overflow:'hidden',position:'relative'},
  yFill:{height:'100%' as any,borderRadius:3.5,opacity:0.88},
  yVal:{fontSize:12.5,fontFamily:mono,fontWeight:'700',width:52,textAlign:'right'},
  warnBox:{borderWidth:1,borderRadius:7,padding:10},warnTxt:{fontSize:11,fontFamily:sans,lineHeight:16},
  sigCard:{backgroundColor:CARD,borderRadius:6,borderWidth:1,borderColor:BORDER,borderTopColor:BORDER_HI,borderTopWidth:1,borderLeftWidth:3,marginHorizontal:16,marginBottom:7,padding:14},
  sigTop:{flexDirection:'row',gap:6,flexWrap:'wrap',marginBottom:9,alignItems:'center'},
  sevIco:{fontSize:9,marginRight:1},
  badge:{paddingHorizontal:7,paddingVertical:3,borderRadius:4},
  badgeTxt:{fontSize:7.5,fontFamily:mono,fontWeight:'800',letterSpacing:1},
  valPill:{borderWidth:1,borderRadius:5,paddingHorizontal:7,paddingVertical:2},
  valPillTxt:{fontSize:9.5,fontFamily:mono,fontWeight:'700'},
  sigTitle:{color:TXT,fontSize:13.5,fontFamily:sans,fontWeight:'700',marginBottom:6},
  sigBody:{color:TXT2,fontSize:11.5,fontFamily:sans,lineHeight:18,marginBottom:10},
  tacticBox:{flexDirection:'row',alignItems:'flex-start',borderWidth:1,borderRadius:6,padding:9},
  tacticLbl:{fontSize:8.5,fontFamily:mono,fontWeight:'800',letterSpacing:1,marginTop:1,flexShrink:0},
  tacticTxt:{color:TXT2,fontSize:11,fontFamily:sans,lineHeight:17,flex:1},
  ctaBtn:{backgroundColor:PINK,marginHorizontal:16,marginBottom:18,marginTop:4,borderRadius:4,paddingVertical:16,alignItems:'center',shadowColor:PINK,shadowOpacity:0.40,shadowRadius:20,shadowOffset:{width:0,height:6},elevation:8},
  ctaBtnTxt:{color:'#fff',fontSize:12.5,fontFamily:mono,fontWeight:'800',letterSpacing:2},
  tabs:{flexDirection:'row',marginHorizontal:16,marginBottom:8,backgroundColor:CARD2,borderRadius:4,borderWidth:1,borderColor:BORDER,padding:3},
  tab:{flex:1,paddingVertical:8,borderRadius:3,alignItems:'center'},
  tabActive:{backgroundColor:CARD3,borderWidth:1,borderColor:BORDER_HI,shadowColor:CYAN,shadowOpacity:0.15,shadowRadius:8,shadowOffset:{width:0,height:0}},
  tabTxt:{color:MUTED,fontSize:9.5,fontFamily:mono,letterSpacing:0.8},
  tabTxtActive:{color:CYAN,fontWeight:'700'},
  regName:{fontSize:21,fontFamily:sans,fontWeight:'800',color:TXT,marginBottom:7,lineHeight:27},
  regDesc:{color:TXT2,fontSize:11.5,fontFamily:sans,lineHeight:18,marginBottom:14},
  stratBox:{flexDirection:'row',alignItems:'flex-start',borderWidth:1,borderRadius:7,padding:10},
  rotLbl:{color:MUTED,fontSize:7.5,fontFamily:mono,letterSpacing:2,marginBottom:9,marginTop:2},
  rotRow:{flexDirection:'row',alignItems:'center',gap:8,marginBottom:7},
  rotDot:{width:5,height:5,borderRadius:2.5},rotName:{color:TXT,fontSize:12,fontFamily:sans,flex:1},
  etfTag:{paddingHorizontal:7,paddingVertical:3,borderRadius:5,borderWidth:1},
  etfTagTxt:{fontSize:8.5,fontFamily:mono,fontWeight:'700'},
  etfChipRow:{flexDirection:'row',flexWrap:'wrap',gap:6,marginTop:4},
  etfChip:{backgroundColor:CARD3,borderWidth:1,borderColor:BORDER_HI,paddingHorizontal:9,paddingVertical:5,borderRadius:6},
  etfChipTxt:{color:TXT2,fontSize:9.5,fontFamily:mono,fontWeight:'700'},
  secRow:{flexDirection:'row',alignItems:'center',paddingVertical:7,gap:10},
  secName:{color:TXT2,fontSize:11,fontFamily:sans,width:108},
  secTrack:{flex:1,height:5,backgroundColor:CARD3,borderRadius:2.5,overflow:'hidden'},
  secFill:{height:'100%' as any,borderRadius:2.5,opacity:0.78},
  secPct:{fontSize:11.5,fontFamily:mono,fontWeight:'700',width:48,textAlign:'right'},
  setupWrap:{flex:1,padding:28,alignItems:'center',justifyContent:'center'},
  setupIcon:{fontSize:40,marginBottom:16},setupTitle:{color:TXT,fontSize:19,fontFamily:sans,fontWeight:'800',marginBottom:10},
  setupBody:{color:TXT2,fontSize:12.5,fontFamily:sans,lineHeight:20,textAlign:'center',marginBottom:22},
  setupStep:{color:SUB,fontSize:11,fontFamily:mono,lineHeight:19},
  disclaimer:{color:MUTED,fontSize:9.5,fontFamily:sans,lineHeight:15,textAlign:'center',marginHorizontal:28,marginTop:12,opacity:0.6},
});