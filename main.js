import { initStoryTheater, showGateway } from './story-theater.js';
import { initDiary } from './diary.js';
import { initCustomMuseum, renderCustomSections, getCustomSectionWidth } from './custom-museum.js';
import { initPixCompanion, showPixVisualOnly, hidePixVisualOnly, setPixVisualState } from './pix-companion.js';
import { initExhibitGenerator } from './exhibit-generator.js';
import { initOnboarding } from './onboarding.js';
import { initPixMemory } from './pix-memory.js';

// ==================== IMAGE SCALE ====================
const S = 0.32;
const SECTION_GAP = 80;

// ==================== SECTIONS ====================
const sections = [
  {
    id: 'where-we-come-from', title: 'Where We Come From', width: 1500,
    wallColor: '#d4cde0', wallColorDark: '#c0b8d0', floorColor: '#8a7e98', floorColorDark: '#6a6080', accentColor: '#5a4e70', titleColor: '#5a4e70',
    folder: './exhibits/where-we-come-from',
    exhibits: [
      { id: 'the-big-bang', file: '01_the_big_bang.png', label: 'The Big Bang', x: 50, y: 55 },
      { id: 'the-first-stars', file: '02_the_first_stars.png', label: 'The First Stars', x: 380, y: 72 },
      { id: 'the-young-earth', file: '03_the_young_earth.png', label: 'The Young Earth', x: 700, y: 58 },
      { id: 'the-first-oceans', file: '04_the_first_oceans.png', label: 'The First Oceans', x: 1050, y: 90 },
      { id: 'the-spark-of-life', file: '05_the_spark_of_life.png', label: 'The Spark of Life', x: 80, y: 250 },
      { id: 'the-cambrian-explosion', file: '06_the_cambrian_explosion.png', label: 'The Cambrian Explosion', x: 360, y: 235 },
      { id: 'the-first-brain', file: '07_the_first_brain.png', label: 'The First Brain', x: 700, y: 280 },
      { id: 'the-vertebrate-brain', file: '08_the_vertebrate_brain.png', label: 'The Vertebrate Brain', x: 1080, y: 265 },
      { id: 'tiktaalik', file: '09_tiktaalik.png', label: 'Tiktaalik', x: 30, y: 420 },
      { id: 'dinosaurs-rule', file: '10_dinosaurs_rule.png', label: 'Dinosaurs Rule', x: 330, y: 405 },
      { id: 'rise-of-mammals', file: '11_rise_of_mammals.png', label: 'Rise of Mammals', x: 720, y: 440 },
      { id: 'the-asteroid', file: '12_the_asteroid.png', label: 'The Asteroid', x: 1020, y: 400 },
      { id: 'dreams-and-memory', file: '13_dreams_and_memory.png', label: 'Dreams & Memory', x: 100, y: 590 },
      { id: 'primates-in-the-trees', file: '14_primates_in_the_trees.png', label: 'Primates in the Trees', x: 370, y: 575 },
      { id: 'mirror-neurons', file: '15_mirror_neurons.png', label: 'Mirror Neurons', x: 780, y: 610 },
      { id: 'first-words', file: '16_first_words.png', label: 'First Words', x: 1080, y: 585 },
      { id: 'cave-art', file: '17_cave_art.png', label: 'Cave Art', x: 40, y: 740 },
      { id: 'fire-and-gathering', file: '18_fire_and_gathering.png', label: 'Fire & Gathering', x: 380, y: 750 },
      { id: 'stone-tools', file: '19_stone_tools.png', label: 'Stone Tools', x: 780, y: 745 },
      { id: 'agriculture', file: '20_agriculture.png', label: 'Agriculture', x: 1100, y: 735 },
    ],
  },
  {
    id: 'yummy', title: 'Yummy — A Delicious History', width: 1500,
    wallColor: '#e8dcc8', wallColorDark: '#d8ccb8', floorColor: '#c4a882', floorColorDark: '#a88960', accentColor: '#8a7a60', titleColor: '#6a5a40',
    folder: './exhibits/yummy',
    exhibits: [
      { id: 'fire-and-cooking', file: '01_fire_and_cooking.png', label: 'Fire & Cooking', x: 30, y: 55 },
      { id: 'bread', file: '02_bread.png', label: 'Bread', x: 320, y: 65 },
      { id: 'salt', file: '03_salt.png', label: 'Salt', x: 600, y: 72 },
      { id: 'sugar', file: '04_sugar.png', label: 'Sugar', x: 870, y: 82 },
      { id: 'chocolate', file: '05_chocolate.png', label: 'Chocolate', x: 1150, y: 58 },
      { id: 'the-spice-trade', file: '06_spice_trade.png', label: 'The Spice Trade', x: 60, y: 240 },
      { id: 'tofu', file: '07_tofu.png', label: 'Tofu', x: 380, y: 270 },
      { id: 'pizza', file: '08_pizza.png', label: 'Pizza', x: 700, y: 255 },
      { id: 'ice-cream', file: '09_ice_cream.png', label: 'Ice Cream', x: 1000, y: 238 },
      { id: 'sushi', file: '11_sushi.png', label: 'Sushi', x: 1230, y: 272 },
      { id: 'canning', file: '10_canning.png', label: 'Canning', x: 20, y: 430 },
      { id: 'french-fries', file: '12_french_fries.png', label: 'French Fries', x: 420, y: 425 },
      { id: 'the-refrigerator', file: '13_the_refrigerator.png', label: 'The Refrigerator', x: 660, y: 418 },
      { id: 'instant-noodles', file: '14_instant_noodles.png', label: 'Instant Noodles', x: 930, y: 410 },
      { id: 'hamburger', file: '15_hamburger.png', label: 'Hamburger', x: 1180, y: 445 },
      { id: 'cereal', file: '16_cereal.png', label: 'Cereal', x: 70, y: 590 },
      { id: 'potato-chips', file: '17_potato_chips.png', label: 'Potato Chips', x: 310, y: 600 },
      { id: 'the-microwave', file: '18_the_microwave.png', label: 'The Microwave', x: 560, y: 625 },
      { id: 'bubble-tea', file: '19_bubble_tea.png', label: 'Bubble Tea', x: 840, y: 580 },
      { id: 'cotton-candy', file: '20_cotton_candy.png', label: 'Cotton Candy', x: 1080, y: 588 },
      { id: 'pesticides-and-herbicides', file: '21_pesticides_and_herbicides.png', label: 'Pesticides & Herbicides', x: 30, y: 775 },
      { id: 'mechanized-farming', file: '22_mechanized_farming.png', label: 'Mechanized Farming', x: 380, y: 780 },
      { id: 'gmos', file: '23_gmos.png', label: 'GMOs', x: 700, y: 785 },
      { id: 'vertical-farms', file: '24_vertical_farms.png', label: 'Vertical Farms', x: 920, y: 770 },
      { id: 'lab-grown-meat', file: '25_lab_grown_meat.png', label: 'Lab-Grown Meat', x: 1180, y: 800 },
    ],
  },
  {
    id: 'transportation', title: 'Get Moving — History of Transportation', width: 2600,
    wallColor: '#dce4e8', wallColorDark: '#c8d4dc', floorColor: '#8a9ea8', floorColorDark: '#6a8090', accentColor: '#5a7a8a', titleColor: '#4a6a7a',
    folder: './exhibits/transportation',
    exhibits: [
      { id: 'vostok-1', file: '16_vostok_1.png', label: 'Vostok 1', x: 150, y: 30 },
      { id: 'saturn-v', file: '17_saturn_v_apollo_11.png', label: 'Saturn V', x: 700, y: 10 },
      { id: 'voyager-1', file: '18_voyager_1.png', label: 'Voyager 1', x: 1200, y: 40 },
      { id: 'spacex-starship', file: '20_spacex_starship.png', label: 'SpaceX Starship', x: 1900, y: 15 },
      { id: 'montgolfier-balloon', file: '09_the_montgolfier_balloon.png', label: 'Montgolfier Balloon', x: 80, y: 310 },
      { id: 'the-wright-flyer', file: '10_the_wright_flyer.png', label: 'The Wright Flyer', x: 450, y: 365 },
      { id: 'heinkel-he-178', file: '11_heinkel_he_178.png', label: 'Heinkel He 178', x: 880, y: 348 },
      { id: 'boeing-747', file: '14_boeing_747.png', label: 'Boeing 747', x: 1250, y: 330 },
      { id: 'concorde', file: '15_concorde.png', label: 'Concorde', x: 1850, y: 355 },
      { id: 'the-caravel', file: '03_the_caravel.png', label: 'The Caravel', x: 200, y: 530 },
      { id: 'ss-great-eastern', file: '05_ss_great_eastern.png', label: 'SS Great Eastern', x: 750, y: 548 },
      { id: 'the-submarine', file: '12_the_submarine.png', label: 'The Submarine', x: 1400, y: 565 },
      { id: 'the-wheel', file: '01_the_wheel.png', label: 'The Wheel', x: 60, y: 735 },
      { id: 'the-war-chariot', file: '02_the_war_chariot.png', label: 'The War Chariot', x: 290, y: 730 },
      { id: 'stephensons-rocket', file: '04_stephensons_rocket.png', label: "Stephenson's Rocket", x: 620, y: 720 },
      { id: 'the-safety-bicycle', file: '06_the_safety_bicycle.png', label: 'The Safety Bicycle', x: 920, y: 735 },
      { id: 'benz-motorwagen', file: '07_benz_motorwagen.png', label: 'Benz Motorwagen', x: 1230, y: 745 },
      { id: 'ford-model-t', file: '08_ford_model_t.png', label: 'Ford Model T', x: 1510, y: 740 },
      { id: 'the-shinkansen', file: '13_the_shinkansen.png', label: 'The Shinkansen', x: 1800, y: 750 },
      { id: 'tesla-roadster', file: '19_tesla_roadster.png', label: 'Tesla Roadster', x: 2220, y: 755 },
    ],
  },
];

// ==================== EXHIBIT METADATA ====================
const exhibitMeta = {
  'the-big-bang': { title:'The Big Bang', year:'~13.8B years ago', tagline:'The moment everything began', detail:'All matter, energy, space, and time erupted from a point smaller than an atom. In the first second, the universe expanded faster than light.', wow:'The entire observable universe was once smaller than a grain of sand.' },
  'the-first-stars': { title:'The First Stars', year:'~200M years after Big Bang', tagline:'Light in the darkness', detail:'The first stars were monsters — hundreds of times more massive than our Sun. They forged heavy elements like carbon and oxygen in their cores.', wow:'Every atom in your body was forged inside a star that exploded billions of years ago.' },
  'the-young-earth': { title:'The Young Earth', year:'~4.5B years ago', tagline:'A violent, molten beginning', detail:'Earth formed from colliding space debris. A Mars-sized planet slammed into it — the debris became our Moon.', wow:'The Moon was created by a collision so violent it melted the entire surface of Earth.' },
  'the-first-oceans': { title:'The First Oceans', year:'~4B years ago', tagline:'Water covers the world', detail:'As Earth cooled, rain fell for millions of years. Comets delivered even more water. The first oceans covered nearly the entire planet.', wow:'Some water in your glass may have been delivered by a comet 4 billion years ago.' },
  'the-spark-of-life': { title:'The Spark of Life', year:'~3.8B years ago', tagline:'Chemistry becomes biology', detail:'Near volcanic vents, simple molecules began to self-replicate. Somehow, chemistry crossed the line into biology.', wow:'All life on Earth descends from one single-celled ancestor.' },
  'the-cambrian-explosion': { title:'The Cambrian Explosion', year:'~540M years ago', tagline:'Life goes wild', detail:'In just 20 million years, almost every major animal body plan appeared. Eyes evolved. Predators and prey locked into an arms race.', wow:'More new body designs appeared in 20M years than in the 3 billion years before.' },
  'the-first-brain': { title:'The First Brain', year:'~520M years ago', tagline:'The beginning of thought', detail:'Flatworms developed the first simple brain — a knot of nerve cells that could process information and make decisions.', wow:'A flatworm can be trained to navigate a maze using a brain smaller than a grain of rice.' },
  'the-vertebrate-brain': { title:'The Vertebrate Brain', year:'~500M years ago', tagline:'The architecture of intelligence', detail:'Early fish evolved a three-part brain. This same architecture sits inside your skull right now.', wow:'Your brain uses the same basic blueprint as a 500-million-year-old fish.' },
  'tiktaalik': { title:'Tiktaalik', year:'~375M years ago', tagline:'The fish that walked', detail:'Tiktaalik had fins with wrist-like joints that could support its weight. It lived halfway between sea and land.', wow:'The bones in your wrist are direct descendants of Tiktaalik\'s fin bones.' },
  'dinosaurs-rule': { title:'Dinosaurs Rule', year:'~230-66M years ago', tagline:'164 million years of dominance', detail:'Dinosaurs dominated Earth for over 160 million years. Some never went extinct — birds are living dinosaurs.', wow:'T. rex is more closely related to a sparrow than to a lizard.' },
  'rise-of-mammals': { title:'Rise of Mammals', year:'~66M years ago', tagline:'Our ancestors emerge from shadows', detail:'For 150 million years, mammals hid from dinosaurs. When the asteroid hit, mammals inherited the Earth.', wow:'The earliest mammals were mouse-sized and nocturnal.' },
  'the-asteroid': { title:'The Asteroid', year:'~66M years ago', tagline:'The day the world changed', detail:'A rock 7.5 miles wide hit at 45,000 mph. The energy of 10 billion nuclear bombs. 75% of all species went extinct.', wow:'The impact created a wave of molten rock higher than Mount Everest.' },
  'dreams-and-memory': { title:'Dreams & Memory', year:'~300M years ago', tagline:'The brain learns to remember', detail:'Early reptiles developed the hippocampus — for the first time, animals could remember specific experiences.', wow:'When you remember something, your brain replays the same neural pattern from the original experience.' },
  'primates-in-the-trees': { title:'Primates in the Trees', year:'~55M years ago', tagline:'Our ancestors take to the canopy', detail:'Early primates evolved grasping hands, forward-facing eyes, and larger brains. Life in the trees was a school for intelligence.', wow:'Your ability to catch a ball uses depth-perception circuits that evolved for swinging through trees.' },
  'mirror-neurons': { title:'Mirror Neurons', year:'~25M years ago', tagline:'The biology of empathy', detail:'Brain cells that fire both when you do something AND when you watch someone else do it. The foundation of empathy.', wow:'When you wince watching someone get hurt, mirror neurons are simulating the pain in your brain.' },
  'first-words': { title:'First Words', year:'~100,000 years ago', tagline:'Language changes everything', detail:'Humans developed complex speech — combining sounds into words, words into sentences, sentences into stories.', wow:'No other species can discuss yesterday, plan for tomorrow, or tell a joke.' },
  'cave-art': { title:'Cave Art', year:'~40,000 years ago', tagline:'The first artists', detail:'By flickering torchlight, humans painted animals and symbols on cave walls. Art was born.', wow:'Some cave paintings in Indonesia are 45,500 years old.' },
  'fire-and-gathering': { title:'Fire & Gathering', year:'~1M years ago', tagline:'The first technology', detail:'Controlling fire let humans cook food, stay warm, and gather in social groups. Fire was the original social network.', wow:'Cooking food may be the single most important factor in the evolution of the large human brain.' },
  'stone-tools': { title:'Stone Tools', year:'~3.3M years ago', tagline:'The hands that built the future', detail:'The oldest known stone tools predate our own species. Each tool was a stored idea, passed across generations.', wow:'The oldest stone tools are 3.3 million years old — made 700,000 years before the genus Homo existed.' },
  'agriculture': { title:'Agriculture', year:'~10,000 years ago', tagline:'The revolution that built civilization', detail:'When humans learned to plant seeds, nomads became settlers. Villages grew into cities. Agriculture organized humanity.', wow:'Wheat was one of the first crops domesticated. Today it feeds more people than any other plant.' },
  'fire-and-cooking': { title:'Fire & Cooking', year:'~1M years ago', tagline:'When food became cuisine', detail:'Cooking was humanity\'s first great invention. Heat makes food safer and more nutritious.', wow:'No other animal cooks its food.' },
  'bread': { title:'Bread', year:'~14,000 years ago', tagline:'The staff of life', detail:'The oldest bread was found in a 14,000-year-old firepit in Jordan — before farming even began.', wow:'Ancient Egyptians had over 30 types of bread and used it as currency.' },
  'salt': { title:'Salt', year:'~6000 BCE', tagline:'The mineral that built empires', detail:'Wars were fought over salt mines. Roman soldiers were partly paid in salt — the origin of "salary."', wow:'The word "salary" comes from the Latin "salarium" — money given to soldiers to buy salt.' },
  'sugar': { title:'Sugar', year:'~8000 BCE', tagline:'The sweet addiction', detail:'Sugarcane was first cultivated in New Guinea. The European craving for sugar drove the colonial slave trade.', wow:'The average American consumes about 77 grams of added sugar per day.' },
  'chocolate': { title:'Chocolate', year:'~1900 BCE', tagline:'Food of the gods', detail:'The Olmec were first to process cacao. The Maya called it "food of the gods." Spain added sugar and changed the world.', wow:'Cacao beans were so valuable to the Aztecs that they used them as money.' },
  'the-spice-trade': { title:'The Spice Trade', year:'~2000 BCE', tagline:'Flavors that moved the world', detail:'Spices were worth more than gold. The quest for them drove Columbus west and da Gama east.', wow:'In medieval Europe, a pound of nutmeg could buy seven fat oxen.' },
  'tofu': { title:'Tofu', year:'~200 BCE', tagline:'The art of transformation', detail:'Legend says tofu was invented when a cook accidentally curdled soy milk with sea salt.', wow:'Tofu can be made into hundreds of different textures.' },
  'pizza': { title:'Pizza', year:'~1889', tagline:'Naples\' gift to the world', detail:'In 1889, Raffaele Esposito created the Margherita — red tomato, white mozzarella, green basil. The Italian flag.', wow:'Americans eat approximately 3 billion pizzas per year.' },
  'ice-cream': { title:'Ice Cream', year:'~200 BCE', tagline:'The frozen dream', detail:'Ancient Chinese mixed snow with fruit. Every culture found its own way to freeze joy.', wow:'The first ice cream machine was patented in 1843.' },
  'sushi': { title:'Sushi', year:'~700 CE', tagline:'Raw perfection', detail:'Sushi began as a preservation method. Modern nigiri was invented in 1820s Tokyo as fast food.', wow:'Master sushi chefs train for 10 years before preparing fish for customers.' },
  'canning': { title:'Canning', year:'1810', tagline:'Food that lasts forever', person:'Nicolas Appert', detail:'Napoleon offered a prize for food preservation. Appert discovered sealing food in jars prevented spoilage.', wow:'Some canned food from the 1820s has been opened and found edible — 200 years later.' },
  'french-fries': { title:'French Fries', year:'~1680s', tagline:'The world\'s favorite side dish', detail:'Belgian villagers fried potatoes when rivers froze. WWI soldiers discovered them in French-speaking Belgium.', wow:'McDonald\'s alone serves about 9 million pounds of fries every day.' },
  'the-refrigerator': { title:'The Refrigerator', year:'1913', tagline:'The cold revolution', detail:'Before refrigeration, ice was cut from frozen lakes and shipped worldwide. The home fridge changed everything.', wow:'Before refrigerators, milk delivery had to happen daily.' },
  'instant-noodles': { title:'Instant Noodles', year:'1958', tagline:'Five minutes to satisfaction', person:'Momofuku Ando', detail:'After seeing long lines at noodle stands in post-war Japan, Ando spent a year inventing instant ramen.', wow:'About 120 billion servings of instant noodles are eaten worldwide each year.' },
  'hamburger': { title:'Hamburger', year:'~1900', tagline:'America\'s sandwich', detail:'Multiple cities claim to have invented it. The ground beef patty on a bun became America\'s most iconic food.', wow:'Americans eat about 50 billion burgers per year.' },
  'cereal': { title:'Cereal', year:'1894', tagline:'Breakfast in a box', person:'John Harvey Kellogg', detail:'Kellogg invented corn flakes as health food. His brother added sugar and turned it commercial.', wow:'The cereal industry spends over $200M per year on advertising aimed at children.' },
  'potato-chips': { title:'Potato Chips', year:'1853', tagline:'The snack born from spite', detail:'Legend says chef George Crum created chips in frustration when a customer kept sending back thick fries.', wow:'The global potato chip market is worth over $30 billion per year.' },
  'the-microwave': { title:'The Microwave', year:'1945', tagline:'Accidental heat', person:'Percy Spencer', detail:'Spencer noticed a chocolate bar melting near a magnetron. He experimented and the microwave oven was born.', wow:'The first microwave was 6 feet tall, weighed 750 pounds, and cost $5,000.' },
  'bubble-tea': { title:'Bubble Tea', year:'1980s', tagline:'Taiwan\'s sweet sensation', detail:'Invented in Taiwan, combining tea, milk, and chewy tapioca pearls. From local novelty to global phenomenon.', wow:'The global bubble tea market is expected to reach $4.3 billion by 2027.' },
  'cotton-candy': { title:'Cotton Candy', year:'1897', tagline:'Spun sugar magic', detail:'A dentist and candy maker invented the cotton candy machine. Melted sugar spun into fluffy clouds.', wow:'Cotton candy was co-invented by a dentist — who saw the business opportunity from both sides.' },
  'pesticides-and-herbicides': { title:'Pesticides & Herbicides', year:'1940s', tagline:'Chemistry feeds the world', detail:'DDT seemed like a miracle. Rachel Carson\'s "Silent Spring" revealed the hidden cost to ecosystems.', wow:'Silent Spring led directly to the creation of the EPA.' },
  'mechanized-farming': { title:'Mechanized Farming', year:'1800s', tagline:'Machines replace muscle', detail:'The steel plow, combine harvester, and tractor transformed farming. One farmer today feeds 155 people.', wow:'In 1900, 41% of Americans worked in agriculture. Today it\'s less than 2%.' },
  'gmos': { title:'GMOs', year:'1994', tagline:'Rewriting nature\'s code', detail:'The first commercial GMO was the Flavr Savr tomato. Genetic modification creates pest-resistant, drought-resistant crops.', wow:'Over 90% of corn, soybeans, and cotton in the US are genetically modified.' },
  'vertical-farms': { title:'Vertical Farms', year:'2010s', tagline:'Growing up, not out', detail:'Indoor towers under LED lights, using 95% less water. A possible answer to feeding 10 billion people.', wow:'A single vertical farm acre can produce the equivalent of 100 outdoor acres.' },
  'lab-grown-meat': { title:'Lab-Grown Meat', year:'2013', tagline:'Meat without the animal', detail:'The first lab-grown burger cost $330,000. Grown from stem cells, it could end factory farming.', wow:'By 2023, some companies projected costs under $10 per pound.' },
  'vostok-1': { title:'Vostok 1', year:'1961', tagline:'"Poyekhali!" — Let\'s go!', person:'Yuri Gagarin', detail:'A 27-year-old carpenter\'s son became the first human in space. One orbit. 108 minutes. "I see Earth. It is so beautiful."', wow:'Before Gagarin, the Soviets sent dogs to space — Laika in 1957.' },
  'saturn-v': { title:'Saturn V & Apollo 11', year:'1969', tagline:'The most powerful machine ever built', person:'NASA', detail:'363 feet tall. 7.5 million pounds of thrust. It carried three men to the Moon. 600 million people watched.', wow:'The Saturn V\'s first stage burned 15 tons of fuel per second.' },
  'voyager-1': { title:'Voyager 1', year:'1977', tagline:'The farthest thing humans have ever made', person:'NASA/JPL', detail:'Now over 14 billion miles away. Still transmitting. It carries a golden record with music and greetings in 55 languages.', wow:'Voyager\'s radio signals take over 22 hours to reach Earth at the speed of light.' },
  'spacex-starship': { title:'SpaceX Starship', year:'2020s', tagline:'From wooden wheels to Mars', person:'SpaceX', detail:'Fully reusable, 394 feet tall, stainless steel. Designed to carry 100 people to Mars.', wow:'Falcon 9 first stage has been landed and reused over 200 times.' },
  'montgolfier-balloon': { title:'Montgolfier Balloon', year:'1783', tagline:'The ancient dream, finally realized', person:'Montgolfier brothers', detail:'A silk balloon filled with hot air rose over Paris carrying two passengers. Humans had left the ground.', wow:'The Montgolfiers got the idea from watching clothes dry over a fire.' },
  'the-wright-flyer': { title:'The Wright Flyer', year:'1903', tagline:'12 seconds that changed everything', person:'Wright brothers', detail:'Two bicycle makers. No degrees. They tested 200 wing designs. December 17, 1903: 12 seconds, 120 feet.', wow:'They got interested in flying after reading about Otto Lilienthal\'s hang-glider flights.' },
  'heinkel-he-178': { title:'Heinkel He 178', year:'1939', tagline:'The first jet flight', person:'Hans von Ohain', detail:'Two engineers independently invented the jet engine — one German, one British, neither knowing about the other.', wow:'The SR-71 Blackbird could cross the Atlantic in under 2 hours at 2,193 mph.' },
  'boeing-747': { title:'Boeing 747', year:'1969', tagline:'The plane that made the world small', person:'Joe Sutter', detail:'The Jumbo Jet doubled capacity. More seats meant cheaper tickets. International travel became accessible.', wow:'The 747\'s upper deck was originally meant to be a first-class lounge.' },
  'concorde': { title:'Concorde', year:'1976', tagline:'The most beautiful machine ever built', detail:'London to New York in 3 hours. Mach 2. When it retired in 2003, nothing replaced it. We chose efficiency over speed.', wow:'Concorde\'s nose drooped during takeoff so pilots could see the runway.' },
  'the-caravel': { title:'The Caravel', year:'1450s', tagline:'The ship that opened the world', detail:'Lateen sails caught wind from any direction. Columbus, Magellan, da Gama — all sailed caravels.', wow:'Columbus\'s Ni\u00f1a was only about 50 feet long — smaller than a tennis court.' },
  'ss-great-eastern': { title:'SS Great Eastern', year:'1857', tagline:'Six times bigger than anything before', person:'Brunel', detail:'At 692 ft, six times bigger than any previous ship. It proved iron giants could cross oceans.', wow:'The Great Eastern laid the first transatlantic telegraph cable in 1866.' },
  'the-submarine': { title:'The Submarine', year:'1773', tagline:'The hidden frontier beneath the waves', detail:'Bushnell\'s "Turtle" was a one-man wooden barrel with a propeller. Today, nuclear subs circle the globe without surfacing.', wow:'Alexander the Great reportedly dived in a glass jar — the earliest "submarine."' },
  'the-wheel': { title:'The Wheel', year:'~3500 BCE', tagline:'Where civilization began to roll', detail:'Solid wooden disks on ox carts. Without the wheel: no chariots, no wagons, no gears, no turbines.', wow:'The wheel was invented after pottery.' },
  'the-war-chariot': { title:'The War Chariot', year:'~1600 BCE', tagline:'The first machine built for speed', detail:'Egyptians replaced solid wheels with spokes — lighter, faster. Two riders: a driver and a warrior.', wow:'Chariots were so prized that pharaohs were buried with them.' },
  'stephensons-rocket': { title:"Stephenson's Rocket", year:'1829', tagline:'The locomotive that outran horses', person:'George Stephenson', detail:'Won the Rainhill Trials. Within 45 years, 160,000 miles of track were laid worldwide.', wow:'George Stephenson taught himself to read at 18.' },
  'the-safety-bicycle': { title:'The Safety Bicycle', year:'1885', tagline:'The freedom machine', person:'John Kemp Starley', detail:'Equal wheels, chain drive, sprung saddle. It gave ordinary people — especially women — personal mobility.', wow:'The bicycle inspired the Wright brothers — they were bicycle makers.' },
  'benz-motorwagen': { title:'Benz Motorwagen', year:'1888', tagline:'The first car you could buy', person:'Karl & Bertha Benz', detail:'Karl built the car. Nobody believed it. So Bertha drove it 111 miles to her mother\'s house.', wow:'The first cars were so unreliable that people brought a horse along — just in case.' },
  'ford-model-t': { title:'Ford Model T', year:'1908', tagline:'A car for everybody', person:'Henry Ford', detail:'Ford invented the assembly line, not the car. By 1927, 15 million Model Ts had been sold.', wow:'Ford\'s first car was little more than an engine on four bicycle wheels.' },
  'the-shinkansen': { title:'The Shinkansen', year:'1964', tagline:'The bullet that reinvented the train', person:'Japan Railways', detail:'200+ km/h on dedicated tracks. It proved rail could compete with planes.', wow:'The Shinkansen has never had a fatal accident in over 50 years.' },
  'tesla-roadster': { title:'Tesla Roadster', year:'2008', tagline:'The electric dream, reborn', person:'Elon Musk', detail:'The first electric car was built in 1897. 111 years later, Tesla revived the idea. Full circle.', wow:'In 2018, SpaceX launched a Tesla Roadster into space — it\'s now orbiting the Sun.' },
};

// ==================== SFX (Web Audio API — play on hover) ====================
const sfxCtx = new (window.AudioContext || window.webkitAudioContext)();
function noiseBuffer(d){const sr=sfxCtx.sampleRate,b=sfxCtx.createBuffer(1,sr*d,sr),c=b.getChannelData(0);for(let i=0;i<c.length;i++)c[i]=Math.random()*2-1;return b}
function playNoise(d,f,ft,v,a){const s=sfxCtx.createBufferSource();s.buffer=noiseBuffer(d);const fl=sfxCtx.createBiquadFilter();fl.type=ft||'lowpass';fl.frequency.value=f||800;const g=sfxCtx.createGain();const t=sfxCtx.currentTime;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v||0.15,t+(a||0.01));g.gain.exponentialRampToValueAtTime(0.001,t+d);s.connect(fl);fl.connect(g);g.connect(sfxCtx.destination);s.start(t);s.stop(t+d)}
function playTone(f,d,ty,v,a){const o=sfxCtx.createOscillator();o.type=ty||'sine';o.frequency.value=f;const g=sfxCtx.createGain();const t=sfxCtx.currentTime;g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(v||0.1,t+(a||0.01));g.gain.exponentialRampToValueAtTime(0.001,t+d);o.connect(g);g.connect(sfxCtx.destination);o.start(t);o.stop(t+d)}
function playToneSweep(sf,ef,d,ty,v){const o=sfxCtx.createOscillator();o.type=ty||'sine';const t=sfxCtx.currentTime;o.frequency.setValueAtTime(sf,t);o.frequency.exponentialRampToValueAtTime(ef,t+d);const g=sfxCtx.createGain();g.gain.setValueAtTime(v||0.1,t);g.gain.exponentialRampToValueAtTime(0.001,t+d);o.connect(g);g.connect(sfxCtx.destination);o.start(t);o.stop(t+d)}

const exhibitSFX = {
  'the-big-bang':()=>{playNoise(1.5,200,'lowpass',0.25,0.005);playTone(30,1.5,'sine',0.15,0.01)},
  'the-first-stars':()=>{playTone(800,1.2,'sine',0.05,0.3);playTone(1200,1.0,'sine',0.03,0.5)},
  'the-young-earth':()=>{playNoise(1.0,300,'lowpass',0.12,0.05);playTone(60,0.8,'sawtooth',0.05)},
  'the-first-oceans':()=>{playNoise(1.5,500,'lowpass',0.08,0.3);playNoise(1.0,400,'lowpass',0.06,0.5)},
  'the-spark-of-life':()=>{playTone(440,0.3,'sine',0.06);setTimeout(()=>playTone(660,0.3,'sine',0.06),200);setTimeout(()=>playTone(880,0.4,'sine',0.05),400)},
  'the-cambrian-explosion':()=>{for(let i=0;i<5;i++)setTimeout(()=>playTone(300+i*80,0.12,'square',0.05),i*70)},
  'the-first-brain':()=>{playTone(200,0.8,'sine',0.05,0.2);playTone(300,0.6,'sine',0.03,0.3)},
  'the-vertebrate-brain':()=>{playTone(250,1.0,'sine',0.05,0.1);playTone(500,0.8,'triangle',0.03,0.2)},
  'tiktaalik':()=>{playNoise(0.3,800,'bandpass',0.08);setTimeout(()=>playNoise(0.2,600,'bandpass',0.06),200)},
  'dinosaurs-rule':()=>{playTone(40,1.5,'sawtooth',0.1,0.1);playNoise(0.6,200,'lowpass',0.08)},
  'rise-of-mammals':()=>{playNoise(0.1,2000,'highpass',0.06);setTimeout(()=>playTone(600,0.4,'sine',0.05),100)},
  'the-asteroid':()=>{setTimeout(()=>{playNoise(0.8,200,'lowpass',0.25,0.005);playTone(30,0.6,'sine',0.15)},150)},
  'dreams-and-memory':()=>{playTone(440,1.5,'sine',0.03,0.5);playTone(550,1.2,'sine',0.02,0.7)},
  'primates-in-the-trees':()=>{for(let i=0;i<3;i++)setTimeout(()=>playNoise(0.06,1500+i*500,'bandpass',0.08),i*120)},
  'mirror-neurons':()=>{playTone(523,0.4,'sine',0.05);setTimeout(()=>playTone(523,0.4,'sine',0.03),500)},
  'first-words':()=>{playTone(300,0.3,'sine',0.06);setTimeout(()=>playTone(400,0.3,'sine',0.06),200)},
  'cave-art':()=>{playNoise(0.4,600,'bandpass',0.04,0.1);playTone(200,0.8,'sine',0.03,0.3)},
  'fire-and-gathering':()=>{playNoise(0.8,3000,'bandpass',0.06,0.02)},
  'stone-tools':()=>{playNoise(0.05,3000,'highpass',0.1);setTimeout(()=>playNoise(0.04,2500,'highpass',0.08),200)},
  'agriculture':()=>{playNoise(0.6,400,'lowpass',0.05,0.1);playTone(220,0.6,'sine',0.03,0.2)},
  'fire-and-cooking':()=>{playNoise(1.0,3000,'bandpass',0.08,0.02)},
  'bread':()=>{playNoise(0.5,800,'lowpass',0.05,0.1);playTone(250,0.6,'sine',0.02,0.2)},
  'salt':()=>{for(let i=0;i<5;i++)setTimeout(()=>playNoise(0.02,6000+Math.random()*2000,'highpass',0.06),i*50)},
  'sugar':()=>{playTone(600,0.3,'sine',0.05);setTimeout(()=>playTone(800,0.3,'sine',0.05),150)},
  'chocolate':()=>{playTone(200,0.8,'sine',0.04,0.3);playTone(300,0.6,'sine',0.03,0.4)},
  'the-spice-trade':()=>{playNoise(0.6,1500,'bandpass',0.05,0.1);playTone(400,0.5,'triangle',0.03)},
  'tofu':()=>{playNoise(0.2,500,'lowpass',0.04);playTone(350,0.4,'sine',0.03,0.1)},
  'pizza':()=>{playNoise(0.6,2000,'bandpass',0.06,0.02)},
  'ice-cream':()=>{playTone(800,0.3,'sine',0.05);setTimeout(()=>playTone(1000,0.3,'sine',0.04),200)},
  'sushi':()=>{playNoise(0.12,2000,'bandpass',0.06);playTone(500,0.4,'sine',0.03,0.1)},
  'canning':()=>{playTone(800,0.1,'square',0.08);setTimeout(()=>playNoise(0.15,1000,'bandpass',0.06),100)},
  'french-fries':()=>{playNoise(0.8,3000,'bandpass',0.08,0.02)},
  'the-refrigerator':()=>{playTone(60,1.2,'sawtooth',0.03,0.3);playTone(120,0.8,'sine',0.02,0.3)},
  'instant-noodles':()=>{playNoise(0.4,2000,'bandpass',0.05);playTone(400,0.2,'sine',0.03)},
  'hamburger':()=>{playNoise(0.6,1500,'bandpass',0.06,0.02)},
  'cereal':()=>{for(let i=0;i<6;i++)setTimeout(()=>playNoise(0.02,4000+Math.random()*3000,'highpass',0.05),i*35)},
  'potato-chips':()=>{playNoise(0.06,5000,'highpass',0.1);setTimeout(()=>playNoise(0.05,4000,'highpass',0.08),120)},
  'the-microwave':()=>{playTone(1000,0.12,'sine',0.06);setTimeout(()=>playTone(1000,0.12,'sine',0.06),250);setTimeout(()=>playTone(1000,0.12,'sine',0.06),500)},
  'bubble-tea':()=>{for(let i=0;i<4;i++)setTimeout(()=>playTone(200+Math.random()*100,0.08,'sine',0.05),i*100)},
  'cotton-candy':()=>{playToneSweep(200,800,0.6,'sine',0.04);playNoise(0.4,2000,'bandpass',0.03,0.1)},
  'pesticides-and-herbicides':()=>{playNoise(0.4,1000,'bandpass',0.05);playTone(150,0.6,'sawtooth',0.03)},
  'mechanized-farming':()=>{playTone(80,0.8,'sawtooth',0.05,0.05);playNoise(0.4,500,'lowpass',0.04,0.1)},
  'gmos':()=>{playTone(400,0.4,'sine',0.04,0.1);playTone(600,0.3,'sine',0.03,0.2)},
  'vertical-farms':()=>{playTone(300,0.8,'sine',0.03,0.3);playTone(450,0.6,'triangle',0.02,0.4)},
  'lab-grown-meat':()=>{playTone(200,0.6,'sine',0.04,0.2);playNoise(0.3,1500,'bandpass',0.03,0.1)},
  'vostok-1':()=>{for(let i=0;i<5;i++)setTimeout(()=>playTone(1000,0.1,'sine',0.08),i*180)},
  'saturn-v':()=>{playNoise(1.5,300,'lowpass',0.2,0.1);playTone(30,1.5,'sine',0.12,0.1)},
  'voyager-1':()=>{playToneSweep(600,900,1.5,'sine',0.05);playToneSweep(900,600,1.5,'triangle',0.03)},
  'spacex-starship':()=>{playToneSweep(40,200,1.2,'sawtooth',0.06);playNoise(1.2,400,'lowpass',0.1,0.2)},
  'montgolfier-balloon':()=>{playNoise(0.3,3000,'bandpass',0.08,0.02);playNoise(0.6,500,'lowpass',0.05,0.2)},
  'the-wright-flyer':()=>{const t=sfxCtx.currentTime;const o=sfxCtx.createOscillator();o.type='sawtooth';o.frequency.value=80;const l=sfxCtx.createOscillator();l.frequency.value=12;const lg=sfxCtx.createGain();lg.gain.value=30;l.connect(lg);lg.connect(o.frequency);const g=sfxCtx.createGain();g.gain.setValueAtTime(0.06,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.8);o.connect(g);g.connect(sfxCtx.destination);o.start(t);l.start(t);o.stop(t+0.8);l.stop(t+0.8)},
  'heinkel-he-178':()=>{playToneSweep(200,2000,1.0,'sawtooth',0.05);playNoise(0.8,3000,'highpass',0.06,0.2)},
  'boeing-747':()=>{const t=sfxCtx.currentTime;const s=sfxCtx.createBufferSource();s.buffer=noiseBuffer(1.2);const f=sfxCtx.createBiquadFilter();f.type='bandpass';f.Q.value=1.5;f.frequency.setValueAtTime(300,t);f.frequency.exponentialRampToValueAtTime(1500,t+0.5);f.frequency.exponentialRampToValueAtTime(400,t+1.2);const g=sfxCtx.createGain();g.gain.setValueAtTime(0.02,t);g.gain.linearRampToValueAtTime(0.1,t+0.5);g.gain.exponentialRampToValueAtTime(0.001,t+1.2);s.connect(f);f.connect(g);g.connect(sfxCtx.destination);s.start(t);s.stop(t+1.2)},
  'concorde':()=>{playNoise(0.06,500,'lowpass',0.15,0.003);setTimeout(()=>playToneSweep(800,2500,0.6,'sawtooth',0.04),120)},
  'the-caravel':()=>{playNoise(1.0,400,'lowpass',0.06,0.3);playNoise(0.8,500,'lowpass',0.04,0.5)},
  'ss-great-eastern':()=>{playTone(85,1.2,'sawtooth',0.06,0.15);playTone(86,1.2,'sawtooth',0.05,0.15)},
  'the-submarine':()=>{for(let i=0;i<3;i++)setTimeout(()=>playTone(1200,0.5,'sine',0.08,0.005),i*500)},
  'the-wheel':()=>{playNoise(0.8,250,'lowpass',0.08,0.05);playTone(60,0.6,'triangle',0.05)},
  'the-war-chariot':()=>{[0,120,200,450,570].forEach(d=>setTimeout(()=>playNoise(0.04,1500,'bandpass',0.08),d))},
  'stephensons-rocket':()=>{playTone(554,0.6,'sine',0.05,0.05);playTone(740,0.6,'sine',0.04,0.05);setTimeout(()=>{for(let i=0;i<2;i++)setTimeout(()=>playNoise(0.08,2000,'highpass',0.05),i*120)},500)},
  'the-safety-bicycle':()=>{[0,180].forEach(d=>setTimeout(()=>{playTone(2200,0.3,'sine',0.08,0.003)},d))},
  'benz-motorwagen':()=>{playToneSweep(60,30,0.25,'sawtooth',0.06);setTimeout(()=>{for(let i=0;i<3;i++)setTimeout(()=>playNoise(0.05,800,'bandpass',0.08),i*80)},200)},
  'ford-model-t':()=>{const t=sfxCtx.currentTime;const o=sfxCtx.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(250,t);o.frequency.setValueAtTime(350,t+0.2);o.frequency.setValueAtTime(250,t+0.4);o.frequency.setValueAtTime(350,t+0.6);const g=sfxCtx.createGain();g.gain.setValueAtTime(0.06,t);g.gain.exponentialRampToValueAtTime(0.001,t+0.8);const f=sfxCtx.createBiquadFilter();f.type='lowpass';f.frequency.value=1200;o.connect(f);f.connect(g);g.connect(sfxCtx.destination);o.start(t);o.stop(t+0.8)},
  'the-shinkansen':()=>{const t=sfxCtx.currentTime;const s=sfxCtx.createBufferSource();s.buffer=noiseBuffer(1.0);const f=sfxCtx.createBiquadFilter();f.type='bandpass';f.Q.value=1.5;f.frequency.setValueAtTime(500,t);f.frequency.exponentialRampToValueAtTime(2500,t+0.3);f.frequency.exponentialRampToValueAtTime(600,t+1.0);const g=sfxCtx.createGain();g.gain.setValueAtTime(0.01,t);g.gain.linearRampToValueAtTime(0.12,t+0.3);g.gain.exponentialRampToValueAtTime(0.001,t+1.0);s.connect(f);f.connect(g);g.connect(sfxCtx.destination);s.start(t);s.stop(t+1.0)},
  'tesla-roadster':()=>{playToneSweep(150,600,0.8,'sine',0.05);playNoise(0.6,1500,'bandpass',0.03,0.2)},
};

function playExhibitSFX(id){if(sfxCtx.state==='suspended')sfxCtx.resume();if(exhibitSFX[id])exhibitSFX[id]()}

// ==================== LAYOUT ====================
const SECTION_HEIGHT = 950;
let CANVAS_W = 0;
const CANVAS_H = SECTION_HEIGHT;
let BASE_CANVAS_W = 0;
const FLOOR_Y = SECTION_HEIGHT - 60;

let totalW = 0;
sections.forEach((sec, i) => { sec._x = totalW; totalW += sec.width; if (i < sections.length - 1) totalW += SECTION_GAP; });
BASE_CANVAS_W = totalW;
CANVAS_W = BASE_CANVAS_W;

const allExhibitImages = {};
async function loadAllImages() {
  const promises = [];
  for (const section of sections) {
    for (const ex of section.exhibits) {
      const img = new Image();
      img.src = `${section.folder}/${ex.file}`;
      promises.push(new Promise(r => { img.onload = () => { allExhibitImages[ex.id] = { img, w: img.naturalWidth * S, h: img.naturalHeight * S }; r(); }; img.onerror = r; }));
    }
  }
  await Promise.all(promises);
}

// ==================== MUSEUM BG ====================
function renderMuseumBg() {
  const bg = document.getElementById('museum-bg');
  bg.width = CANVAS_W; bg.height = CANVAS_H;
  bg.style.width = CANVAS_W + 'px'; bg.style.height = CANVAS_H + 'px';
  const ctx = bg.getContext('2d');
  sections.forEach(sec => {
    const sx = sec._x, sw = sec.width;
    ctx.fillStyle = sec.wallColor; ctx.fillRect(sx, 0, sw, FLOOR_Y);
    const wg = ctx.createLinearGradient(0, 0, 0, FLOOR_Y);
    wg.addColorStop(0, 'rgba(255,255,255,0.03)'); wg.addColorStop(0.7, 'rgba(0,0,0,0)'); wg.addColorStop(1, 'rgba(0,0,0,0.04)');
    ctx.fillStyle = wg; ctx.fillRect(sx, 0, sw, FLOOR_Y);
    ctx.fillStyle = sec.accentColor; ctx.fillRect(sx, 0, sw, 5);
    ctx.fillStyle = sec.floorColor; ctx.fillRect(sx, FLOOR_Y, sw, CANVAS_H - FLOOR_Y);
    if (sec.floorColorDark) { ctx.fillStyle = sec.floorColorDark; for (let fy = FLOOR_Y; fy < CANVAS_H; fy += 12) ctx.fillRect(sx, fy, sw, 1); }
    // Section title is rendered as DOM only (no canvas watermark)
  });
  for (let i = 0; i < sections.length - 1; i++) {
    const ax = sections[i]._x + sections[i].width;
    ctx.fillStyle = '#2a2420'; ctx.fillRect(ax, 0, SECTION_GAP, CANVAS_H);
    ctx.fillStyle = '#1a1810'; ctx.fillRect(ax + 10, 30, SECTION_GAP - 20, FLOOR_Y - 30);
    ctx.fillStyle = '#3a3430'; ctx.beginPath(); ctx.ellipse(ax + SECTION_GAP / 2, 30, (SECTION_GAP - 20) / 2, 25, 0, Math.PI, 0); ctx.fill();
  }
}

// ==================== RENDER EXHIBITS ====================
const museumCanvas = document.getElementById('museum-canvas');

const layout = [];
for (const sec of sections) for (const ex of sec.exhibits) layout.push({ id: ex.id, x: sec._x + ex.x, y: ex.y, section: sec.id });

function renderExhibits() {
  museumCanvas.querySelectorAll('.exhibit:not(.custom-section-el)').forEach(el => el.remove());
  museumCanvas.querySelectorAll('.section-title:not(.custom-section-el)').forEach(el => el.remove());
  museumCanvas.style.width = CANVAS_W + 'px'; museumCanvas.style.height = CANVAS_H + 'px';

  let exploredIds = new Set();
  try { const sd = JSON.parse(localStorage.getItem('invention_museum_stories') || '{}'); for (const [id, ex] of Object.entries(sd.exhibits || {})) if (ex.stories?.length > 0) exploredIds.add(id); } catch {}

  for (const sec of sections) {
    const t = document.createElement('div'); t.className = 'section-title';
    t.style.left = (sec._x + sec.width / 2) + 'px'; t.style.top = '12px'; t.style.transform = 'translateX(-50%)';
    t.style.color = sec.titleColor; t.textContent = sec.title.toUpperCase(); museumCanvas.appendChild(t);

    for (const ex of sec.exhibits) {
      const d = allExhibitImages[ex.id]; if (!d) continue;
      const el = document.createElement('div'); el.className = 'exhibit' + (exploredIds.has(ex.id) ? ' explored' : '');
      el.style.left = (sec._x + ex.x) + 'px'; el.style.top = ex.y + 'px'; el.dataset.id = ex.id;
      const art = document.createElement('div'); art.className = 'exhibit-art';
      const img = document.createElement('img'); img.src = d.img.src; img.style.width = d.w + 'px'; img.style.height = d.h + 'px'; img.alt = ex.label; img.draggable = false;
      art.appendChild(img); el.appendChild(art);
      const lb = document.createElement('div'); lb.className = 'exhibit-label'; lb.innerHTML = `<h3>${ex.label}</h3>`; el.appendChild(lb);
      museumCanvas.appendChild(el);
    }
  }
}

// ==================== HOVER (SFX) + CLICK ====================
museumCanvas.addEventListener('mouseover', (e) => { const a = e.target.closest('.exhibit-art'); if (!a) return; const id = a.closest('.exhibit')?.dataset?.id; if (id) playExhibitSFX(id); });
museumCanvas.addEventListener('click', (e) => { const a = e.target.closest('.exhibit-art'); if (!a) return; if (didDrag) { didDrag = false; return; } const id = a.closest('.exhibit')?.dataset?.id; const d = exhibitMeta[id]; if (d) { const l = layout.find(item => item.id === id); showGateway(id, d, l?.section); } });

// ==================== PAN ====================
let panX = 0, panY = 0, isDragging = false, startX = 0, startY = 0, startPanX = 0, startPanY = 0, didDrag = false;
const world = document.getElementById('museum-world');
const bgCanvas = document.getElementById('museum-bg');

function applyPan() {
  const tw = Math.max(CANVAS_W, BASE_CANVAS_W + getCustomSectionWidth());
  const mx = Math.max(0, tw - window.innerWidth), my = Math.max(0, CANVAS_H - window.innerHeight);
  panX = Math.max(-mx, Math.min(0, panX)); panY = Math.max(-my, Math.min(0, panY));
  const t = `translate(${panX}px,${panY}px)`; museumCanvas.style.transform = t; bgCanvas.style.transform = t; updateMinimap();
}

world.addEventListener('mousedown', (e) => { if (e.target.closest('#story-gateway') || e.target.closest('#story-theater') || e.target.closest('#minimap') || e.target.closest('#pix-chat') || e.target.closest('#gen-machine')) return; isDragging = true; didDrag = false; startX = e.clientX; startY = e.clientY; startPanX = panX; startPanY = panY; });
document.addEventListener('mousemove', (e) => { if (!isDragging) return; const dx = e.clientX - startX, dy = e.clientY - startY; if (Math.abs(dx) > 3 || Math.abs(dy) > 3) didDrag = true; panX = startPanX + dx; panY = startPanY + dy; applyPan(); });
document.addEventListener('mouseup', () => { isDragging = false; });
document.addEventListener('wheel', (e) => { if (e.target.closest('#story-gateway') || e.target.closest('#story-theater') || e.target.closest('#pix-chat') || e.target.closest('#gen-machine')) return; e.preventDefault(); panX -= e.deltaX; panY -= e.deltaY; applyPan(); }, { passive: false });
let touchSX = 0, touchSY = 0, touchPX = 0, touchPY = 0;
world.addEventListener('touchstart', (e) => { touchSX = e.touches[0].clientX; touchSY = e.touches[0].clientY; touchPX = panX; touchPY = panY; });
world.addEventListener('touchmove', (e) => { panX = touchPX + (e.touches[0].clientX - touchSX); panY = touchPY + (e.touches[0].clientY - touchSY); applyPan(); }, { passive: true });

// ==================== MINIMAP ====================
function updateMinimap() { const mm = document.getElementById('minimap'), vp = document.getElementById('minimap-viewport'); const sx = mm.offsetWidth / CANVAS_W, sy = mm.offsetHeight / CANVAS_H; vp.style.width = (window.innerWidth * sx) + 'px'; vp.style.height = (window.innerHeight * sy) + 'px'; vp.style.left = (-panX * sx) + 'px'; vp.style.top = (-panY * sy) + 'px'; }
function renderMinimap() { const dots = document.getElementById('minimap-dots'), mm = document.getElementById('minimap'); const sx = mm.offsetWidth / CANVAS_W, sy = mm.offsetHeight / CANVAS_H; let eids; try { const sd = JSON.parse(localStorage.getItem('invention_museum_stories') || '{}'); eids = new Set(Object.entries(sd.exhibits || {}).filter(([, v]) => v.stories?.length > 0).map(([k]) => k)); } catch { eids = new Set(); } dots.innerHTML = layout.map(i => `<div class="minimap-dot${eids.has(i.id) ? ' explored' : ''}" style="left:${i.x * sx}px;top:${i.y * sy}px"></div>`).join(''); }
document.getElementById('minimap').addEventListener('click', (e) => { const mm = e.currentTarget, r = mm.getBoundingClientRect(); panX = -((e.clientX - r.left) * (CANVAS_W / mm.offsetWidth) - window.innerWidth / 2); panY = -((e.clientY - r.top) * (CANVAS_H / mm.offsetHeight) - window.innerHeight * 0.45); applyPan(); });

// ==================== MUSIC (removed) ====================

// ==================== SCROLL TO EXHIBIT ====================
function scrollToExhibit(id) { const item = layout.find(l => l.id === id); if (!item) return; panX = -(item.x - window.innerWidth / 2 + 50); panY = -(item.y - window.innerHeight / 2 + 50); applyPan(); const el = museumCanvas.querySelector(`.exhibit[data-id="${id}"]`); if (el) { el.style.transition = 'filter 0.3s'; el.style.filter = 'brightness(1.5)'; setTimeout(() => { el.style.filter = ''; }, 800); } }

// ==================== INIT ====================
async function init() {
  await loadAllImages();
  CANVAS_W = BASE_CANVAS_W + getCustomSectionWidth();
  renderMuseumBg(); renderExhibits(); renderMinimap(); applyPan();

  initStoryTheater(exhibitMeta, { scrollToExhibit, onTheaterClose: () => {}, onTheaterOpen: () => {} });
  initDiary();
  initCustomMuseum({ onSectionCreated: () => { CANVAS_W = BASE_CANVAS_W + getCustomSectionWidth(); renderMuseumBg(); renderCustomSections(museumCanvas, bgCanvas); applyPan(); renderMinimap(); }, onExhibitCreated: () => { CANVAS_W = BASE_CANVAS_W + getCustomSectionWidth(); applyPan(); renderMinimap(); }, getMuseumWidth: () => BASE_CANVAS_W });
  CANVAS_W = BASE_CANVAS_W + getCustomSectionWidth();
  renderCustomSections(museumCanvas, bgCanvas); applyPan();
  initPixCompanion({ exhibitMeta, getViewportCenter: () => ({ x: -panX + window.innerWidth / 2, y: -panY + window.innerHeight / 2 }), onExhibitGenRequested: null });
  initExhibitGenerator(exhibitMeta);
  initPixMemory();
  initOnboarding({
    panToSection: (sectionId) => {
      const sec = sections.find(s => s.id === sectionId);
      if (!sec) return;
      const targetX = -(sec._x + sec.width / 2 - window.innerWidth / 2);
      const targetY = -(SECTION_HEIGHT / 2 - window.innerHeight / 2);
      // Smooth animated pan
      const startX = panX, startY = panY;
      const duration = 1200;
      const start = performance.now();
      function animatePan(now) {
        const t = Math.min(1, (now - start) / duration);
        const ease = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        panX = startX + (targetX - startX) * ease;
        panY = startY + (targetY - startY) * ease;
        applyPan();
        if (t < 1) requestAnimationFrame(animatePan);
      }
      requestAnimationFrame(animatePan);
    },
    showPixCompanion: () => showPixVisualOnly(),
    hidePixCompanion: () => hidePixVisualOnly(),
    setPixState: (state) => setPixVisualState(state),
  });
}
init();
