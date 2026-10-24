import type { BugDef, FishDef, ItemDef } from './items';
export const EXTRA_ITEMS: ItemDef[] = [];
const def = (item: ItemDef): void => { EXTRA_ITEMS.push(item); };

type ExtraFish = [string, string, string, number, FishDef['hours'], FishDef['shadow'], FishDef['seasons'], FishDef['where'], number];
const extraFish: ExtraFish[] = [
  ['rain-barbel','Rain Barbel','Its whiskers tremble before a storm reaches town.',18,[5,11],2,['spring'],['river'],280],
  ['postal-goby','Postal Goby','Blue bars cross its side like cancelled stamps.',24,[0,24],1,undefined,['ocean'],100],
  ['reed-gudgeon','Reed Gudgeon','A shy bronze flicker among the pond reeds.',22,[6,18],1,['spring','summer'],['pond'],130],
  ['bell-char','Bell Char','Its red fins ring the cold current without sound.',8,[16,6],2,['winter'],['river'],680],
  ['orchard-roach','Orchard Roach','Waits below the bank for windfallen fruit.',18,[8,19],1,['autumn'],['river'],190],
  ['blue-thimblefish','Blue Thimblefish','Small enough to shelter beneath a bottle cap.',20,[9,16],1,['summer'],['ocean'],160],
  ['gorge-grayling','Gorge Grayling','A violet sail in the fastest northern water.',7,[4,10],2,['spring','autumn'],['river'],760],
  ['boiler-bass','Boiler Bass','Round, black, and warm from the summer shallows.',13,[11,18],3,['summer'],['pond'],580],
  ['paper-nautilus','Paper Nautilus','Its shell resembles a letter folded by the tide.',4,[20,5],2,['summer','autumn'],['ocean'],1450],
  ['snowflake-flounder','Snowflake Flounder','Both eyes watch the winter surface from below.',12,[0,24],2,['winter'],['ocean'],440],
  ['copper-mackerel','Copper Mackerel','A fast green school with penny-bright bellies.',26,[5,9],2,['spring','summer'],['ocean'],210],
  ['marsh-bowfin','Marsh Bowfin','Breathes the pond air when summer steals the water.',7,[18,4],3,['summer'],['pond'],920],
  ['ink-squid','Ink Squid','Writes one furious sentence across the sea.',11,[19,6],2,['autumn','winter'],['ocean'],630],
  ['wake-tuna','Wake Tuna','Never stops swimming; perhaps it fears stillness.',3,[6,18],3,['summer','autumn'],['ocean'],2200],
  ['riveter-shad','Riveter Shad','Its school clicks through the river like loose type.',20,[15,20],1,['spring'],['river'],170],
  ['cream-lamprey','Cream Lamprey','An ancient mouth attached to a ribbon of muscle.',6,[0,5],2,['winter','spring'],['river'],830],
  ['sunken-puffer','Sunken Puffer','Inflates into a prickly little navigation buoy.',9,[10,17],2,['summer'],['ocean'],510],
  ['mirror-carp','Mirror Carp','Every scale reflects a different piece of sky.',5,[6,10],3,['spring','autumn'],['pond'],1250],
  ['red-telegram','Red Telegram','A scarlet needlefish that arrives before dusk.',10,[15,19],2,['autumn'],['ocean'],720],
  ['chimney-gar','Chimney Gar','Long-nosed and soot-dark, lurking below the bridge.',5,[20,4],3,['summer'],['river'],1180],
  ['winter-whiting','Winter Whiting','A pale sea fish with a voice like sleigh bells.',20,[4,12],1,['winter'],['ocean'],180],
  ['spring-sculpin','Spring Sculpin','All head, all appetite, briefly all spring.',15,[0,24],1,['spring'],['river','pond'],230],
  ['amber-jellyfish','Amber Jellyfish','A harmless bell carrying sunset through the surf.',12,[18,2],2,['summer'],['ocean'],390],
  ['foundry-shark','Foundry Shark','A black fin from the deep industrial trench.',2,[21,4],3,['summer'],['ocean'],3400],
  ['leaf-snapper','Leaf Snapper','Red and gold as the first autumn canopy.',14,[7,17],2,['autumn'],['ocean'],470],
  ['icefish','Clear Icefish','Bloodless and almost invisible in winter water.',8,[0,24],1,['winter'],['ocean'],650],
  ['storm-pomfret','Storm Pomfret','Only feeds beneath rain-dark waves.',5,[12,20],3,['spring','autumn'],['ocean'],1320],
  ['old-king-salmon','Old King Salmon','Scarred from a lifetime of returning home.',2,[4,9],3,['autumn'],['river'],2900],
];
export const EXTRA_FISH: FishDef[] = extraFish.map(([id,name,description,weight,hours,shadow,seasons,where,price]) => {
  def({id,name,category:'fish',icon:shadow===3?'🐋':'🐟',sellPrice:price,description,
    archiveLabel:`Field drawer — ${description} CATALOGER confirms the season and water in a careful copperplate hand.`});
  return {itemId:id,weight,hours,shadow,seasons,where};
});

type ExtraBug = [string,string,string,number,BugDef['hours'],BugDef['habitat'],BugDef['seasons'],number,string];
const extraBugs: ExtraBug[] = [
 ['rain-aphid','Rain Aphid','Pearl-green and busiest after wet mornings.',24,[5,12],'flowers',['spring'],80,'🐞'],
 ['letter-wasp','Letter Wasp','Builds envelope-shaped nests beneath old eaves.',8,[9,17],'trees',['summer'],460,'🐝'],
 ['velvet-ant','Velvet Ant','A wingless wasp in a brilliant warning coat.',10,[11,18],'grass',['summer'],380,'🐞'],
 ['brook-damselfly','Brook Damselfly','A blue needle sewing light above the river.',18,[8,17],'grass',['spring','summer'],210,'🪰'],
 ['paper-moth','Paper Moth','Its wings resemble a page left in rain.',16,[18,5],'trees',['spring','autumn'],250,'🦋'],
 ['orchard-bee','Orchard Mason Bee','Sleeps in keyholes and wakes with blossom.',22,[7,16],'flowers',['spring'],140,'🐝'],
 ['iron-tiger-beetle','Iron Tiger Beetle','A metallic hunter sprinting between sunspots.',7,[10,16],'grass',['summer'],700,'🪲'],
 ['pond-whirligig','Pond Whirligig','Writes frantic circles on still water.',20,[9,19],'grass',['summer'],120,'🪲'],
 ['scarlet-darner','Scarlet Darner','Patrols the meadow like a tiny red aircraft.',9,[10,17],'grass',['autumn'],490,'🪰'],
 ['chimney-swift-moth','Chimney Swift Moth','Soot-dark wings dusted with silver ash.',13,[20,4],'trees',['autumn','winter'],330,'🦋'],
 ['fiddle-cricket','Fiddle Cricket','Saws one sweet note beneath the grass.',18,[17,6],'grass',['autumn'],190,'🦗'],
 ['acorn-weevil','Acorn Weevil','A comic nose built for drilling autumn stores.',22,[8,18],'trees',['autumn'],100,'🪲'],
 ['snow-midge','Snow Midge','Dances above drifts on the stillest days.',20,[10,15],'grass',['winter'],130,'🪰'],
 ['ice-caddis','Ice Caddis','Carries a case of crystal grit.',10,[6,14],'grass',['winter'],410,'🪰'],
 ['winter-rove','Winter Rove Beetle','A black comma moving across white ground.',16,[0,24],'trees',['winter'],180,'🪲'],
 ['rose-chafer','Rose Chafer','Green-gold armor powdered with pollen.',14,[8,17],'flowers',['spring','summer'],300,'🪲'],
 ['plaza-ant','Plaza Ant','Carries crumbs between the flagstone joints.',30,[6,20],'grass',undefined,60,'🐞'],
 ['lamp-gnat','Lamp Gnat','Orbits every amber lamp with total devotion.',26,[19,5],'grass',undefined,70,'🪰'],
 ['post-hornworm','Post Hornworm','Chews postal-blue leaves into lace.',12,[6,14],'flowers',['summer'],260,'🐛'],
 ['bramble-stick','Bramble Stick Insect','A twig that occasionally changes its mind.',8,[5,10],'trees',['autumn'],620,'🦗'],
 ['moon-silk-moth','Moon Silk Moth','Huge pale wings marked by two watchful moons.',3,[22,3],'trees',['summer'],1600,'🦋'],
 ['rusty-snail','Rusty Snail','Leaves a silver route across rain-dark stone.',18,[4,11],'flowers',['spring','autumn'],120,'🐌'],
 ['frost-mantis','Frost Mantis','White as dead grass, motionless until dusk.',6,[14,19],'grass',['winter'],840,'🦗'],
 ['meadow-bumble','Meadow Bumblebee','Too round for flight, yet cheerfully airborne.',24,[8,18],'flowers',['spring','summer'],150,'🐝'],
 ['copper-leafhopper','Copper Leafhopper','Springs from leaf to leaf like a loose rivet.',20,[7,18],'flowers',['autumn'],130,'🦗'],
 ['archive-silverfish','Archive Silverfish','CATALOGER insists it has eaten no important labels.',9,[0,5],'trees',undefined,350,'🪲'],
 ['crown-stag','Crown Stag','Antlers broad enough to cast their own shadow.',2,[21,4],'trees',['summer'],2400,'🪲'],
 ['aurora-lacewing','Aurora Lacewing','Green wings shift color beneath winter stars.',3,[20,2],'trees',['winter'],1900,'🪰'],
];
export const EXTRA_BUGS: BugDef[] = extraBugs.map(([id,name,description,weight,hours,habitat,seasons,price,icon]) => {
 def({id,name,category:'bug',icon,sellPrice:price,description,archiveLabel:`Entomology drawer — ${description} A pinned note records its hour and habitat.`});
 return {itemId:id,weight,hours,habitat,seasons};
});

export interface SeaDef { itemId:string; weight:number; hours:[number,number]; seasons?: import('../systems/Calendar').Season[]; speed:1|2|3 }
const seaRows: Array<[string,string,string,number,[number,number],SeaDef['seasons'],SeaDef['speed'],number]> = [
 ['sea-star','Brass Sea Star','Five patient arms gripping the drowned breakwater.',22,[0,24],undefined,1,180],
 ['sea-cucumber','Velvet Sea Cucumber','A soft old caretaker vacuuming the seabed.',20,[0,24],undefined,1,220],
 ['moon-snail','Moon Snail','A perfect spiral leaving a broad silver trail.',16,[18,6],undefined,1,300],
 ['letter-octopus','Letter Octopus','Its arms curl into eight different signatures.',7,[19,5],['summer','autumn'],3,1100],
 ['clock-urchin','Clock Urchin','Its spines tick gently when held to the ear.',12,[0,24],undefined,1,460],
 ['glass-shrimp','Glass Shrimp','Only its tiny copper heart gives it away.',18,[4,10],['spring'],2,280],
 ['rivet-crab','Rivet Crab','Fastens bottle caps to its shell for armor.',14,[0,24],undefined,2,390],
 ['garden-eel','Garden Eel','A colony of shy punctuation marks.',11,[8,17],['summer'],2,520],
 ['ink-nudibranch','Ink Nudibranch','A black velvet slug edged in postal red.',8,[20,4],['autumn'],1,740],
 ['snow-anemone','Snow Anemone','Winter-white tentacles bloom under the ice-cold sea.',13,[0,24],['winter'],1,430],
 ['bell-scallop','Bell Scallop','Claps through the water with a porcelain chime.',15,[6,18],undefined,2,340],
 ['foundry-lobster','Foundry Lobster','Soot-blue armor and formidable brass claws.',5,[21,5],['summer'],3,1350],
 ['sea-pig','Rose Sea Pig','A tiny pink walker from water far too deep.',3,[0,24],['winter'],1,1800],
 ['ribbon-worm','Telegram Ribbon Worm','Unspools several metres of improbable red.',9,[18,6],['spring','autumn'],2,680],
 ['pearl-oyster','Postmaster Pearl Oyster','Holds one cream pearl like a sealed reply.',4,[0,24],undefined,1,1500],
 ['basket-star','Archive Basket Star','A living net of branching amber arms.',3,[22,4],['autumn'],2,1700],
 ['horseshoe-crab','Old Horseshoe Crab','Older than flowers, still crossing the same sand.',8,[0,24],['spring'],2,860],
 ['giant-isopod','Depot Giant Isopod','A deep-sea pill bug built like a railway carriage.',2,[0,5],['winter'],3,2600],
];
export const SEA_CREATURES: SeaDef[] = seaRows.map(([id,name,description,weight,hours,seasons,speed,price]) => {
 def({id,name,category:'sea',icon:'🫧',sellPrice:price,description,archiveLabel:`Marine drawer — ${description}`});
 return {itemId:id,weight,hours,seasons,speed};
});

const fossils = [
 ['fossil-fern','Copper Fern Impression','A perfect frond pressed into iron-red shale.'],
 ['fossil-trilobite','Depot Trilobite','A many-segmented traveler from the first seas.'],
 ['fossil-amber-wing','Amber Wing','A lacewing held in sunlight for a hundred million years.'],
 ['fossil-shell','Spiral Sea Fossil','A stone coil that once navigated an inland ocean.'],
 ['fossil-tooth','Gorge Fang','One serrated tooth from something best left extinct.'],
 ['fossil-paw','Little Trackway','Five small footprints crossing one slab forever.'],
 ['fossil-leaf','Orchard Leaf Stone','A leaf from a forest with no surviving name.'],
 ['fossil-coral','Clock Coral','A round colony patterned like clockwork.'],
 ['fossil-bone','Hollow Wing Bone','Light enough for a vanished giant to fly.'],
 ['fossil-scale','River Giant Scale','A hand-sized scale mineralized in blue slate.'],
 ['fossil-seed','First Seedpod','A stone pod from when flowering was a new idea.'],
 ['fossil-nest','Thunder Lizard Nest','Three shell fragments arranged around an empty center.'],
] as const;
export const FOSSILS = fossils.map(([id,name,description],i) => {
 def({id,name,category:'fossil',icon:'🦴',sellPrice:550+i*85,description,archiveLabel:`Palaeontology drawer ${String(i+1).padStart(2,'0')} — ${description}`}); return id;
});

export const ART_PAIRS = [
 ['art-warm-square','art-warm-square-forgery','The Warm Square','The lower-right ochre stone has a deliberate thumbprint.'],
 ['art-last-orchard','art-last-orchard-forgery','The Last Orchard','A real work shows seven distant trees; the forgery shows eight.'],
 ['art-quiet-engine','art-quiet-engine-forgery','Quiet Engine at Rest','The authentic flywheel turns counter-clockwise in the painted reflection.'],
 ['art-river-letter','art-river-letter-forgery','Letter Carried Downriver','The authentic envelope bears a broken blue seal.'],
 ['art-lamplighter','art-lamplighter-forgery','Study of a Lamplighter','The true lamp flame leans left, against the sitter’s gaze.'],
 ['art-empty-table','art-empty-table-forgery','Breakfast After Departure','One chipped cup: authentic on the left, forged on the right.'],
] as const;
for (const [realId,fakeId,name,tell] of ART_PAIRS) {
 def({id:realId,name,category:'art',icon:'🖼️',sellPrice:2400,description:`A conserved town work. Inspection note: ${tell}`,archiveLabel:`Fine arts wing — ${name}. Provenance verified.`,authentic:true,artTell:tell});
 def({id:fakeId,name:`${name} (?)`,category:'art',icon:'🖼️',sellPrice:180,description:`Something is wrong. Inspection note: ${tell}`,authentic:false,artTell:tell});
}
