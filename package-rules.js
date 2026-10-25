// Versioned IDs preserve the rights of payments created before these offers.
export const PACKAGES=Object.freeze({
 'download_119_v1':{price:119,g:0,h:0,name:'ปลดล็อกดาวน์โหลดงานนี้ ไม่มีลายน้ำ ทุกขนาด',requiresImage:true,fullEdit:true},
 'download_89_v1':{price:89,g:0,h:0,name:'ปลดล็อกดาวน์โหลดงานนี้ ไม่มีลายน้ำ ทุกขนาด',requiresImage:true,fullEdit:true},
 '89_v4':{price:89,g:2,h:0,name:'ประมวลผลรูปหรือเปลี่ยนผมรวม 2 ครั้ง',requiresImage:false,fullEdit:true},
 '159_v6':{price:159,g:10,h:0,name:'ประมวลผลรูปหรือเปลี่ยนผมรวม 10 ครั้ง',requiresImage:false,fullEdit:true},
 '79':{price:79,g:0,h:0,name:'รับรูปนี้',requiresImage:true,fullEdit:true},
 '79_v2':{price:89,g:1,h:0,name:'รับรูป / สร้าง 1 ครั้ง',requiresImage:false,fullEdit:true},
 '149_v2':{price:159,g:3,h:0,name:'สร้าง 3 ครั้ง',requiresImage:false,fullEdit:false},
 '149_trial_v3':{price:159,g:2,h:0,name:'รับรูปนี้ + สร้างเพิ่ม 2 ครั้ง',requiresImage:true,fullEdit:false},
 '89_image_v3':{price:89,g:0,h:0,name:'รับรูปนี้',requiresImage:true,fullEdit:true},
 '159_v4':{price:159,g:10,h:0,name:'สร้าง 10 ครั้ง',requiresImage:false,fullEdit:false},
 '159_v5':{price:159,g:5,h:0,aiHair:5,name:'หน้าตรง 5 รูป + ผม AI 5 ครั้ง',requiresImage:false,fullEdit:false},
 '149':{price:149,g:1,h:2,legacy:true},
 '199':{price:199,g:2,h:3,legacy:true}
});
export function packageFor(id){const p=PACKAGES[String(id)];if(!p)throw Error('invalid_package');return p;}
export function checkoutPackage(id){if(!['119','download_119_v1'].includes(String(id)))throw Error('invalid_package');return {id:'download_119_v1',...packageFor('download_119_v1')}}
export function remaining(row){return Number(row?.generation_remaining||0)+Number(row?.hair_remaining||0);}


