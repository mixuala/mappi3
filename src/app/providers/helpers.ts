
export class ScreenDim {
  constructor(){}
  static w: number;
  static h: number;
  static set(width:number, height:number){
    ScreenDim.w = width;
    ScreenDim.h = height;
    console.log("resize event, screenDim=", [ScreenDim.w, ScreenDim.h]);    
  }
}