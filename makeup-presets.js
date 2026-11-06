// Existing skin-only options are unchanged; the final preset uses the server AI makeup route.
export const MAKEUP_LOOKS=[
 {id:'skin-bright-v1',name:'ผิวสว่างฟุ้ง',preview:'/assets/makeup/looks/skin-base.webp',previewFilter:'brightness(1.1) contrast(.97)'},
 {id:'skin-glow-v1',name:'เพิ่มความวาว',preview:'/assets/makeup/looks/skin-base.webp',previewFilter:'brightness(1.04) contrast(1.04)'},
 {id:'skin-smooth-v1',name:'ผิวเนียน',preview:'/assets/makeup/looks/skin-base.webp',previewFilter:'contrast(.97)'},
 {id:'soft-rosy-ai-v1',ai:true,name:'AI · เมคอัพชมพูละมุน · ผิวสว่างนุ่ม',preview:'/assets/face-finish/makeup.webp'}
];
export function makeupLook(id){return MAKEUP_LOOKS.find(look=>look.id===id)||null}
