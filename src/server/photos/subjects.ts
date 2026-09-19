// What a photograph on a screen can be of. Jev cannot describe a picture, but
// it can say which of these the screen is about. The answer does two jobs: it
// names a shelf of the library to look on, and it says how such a thing is
// photographed, which is the art direction when a picture has to be made.
//
// `criteria` is what Jev reads. `shot` is what the image model reads. `keywords`
// stock the shelf from the Unsplash dataset (build.ts), and only the subjects
// that dataset is good at have any: it is landscapes and animals, with next to
// no food, shops or gadgets. The other shelves start empty and fill with the
// pictures made for them.

export interface Subject {
  criteria: string;
  shot: string;
  keywords?: string[];
  /** A photograph carrying one of these is kept off the shelf, however well it matches. */
  not?: string[];
  /** Only photographs shelved here will do. A dog walker's portrait is not a photograph of a dog, whatever words they share. */
  own?: boolean;
}

const SCENE = "A wide landscape photograph in natural light, with depth and a clear horizon or focal point.";
const ANIMAL = "A wildlife-style photograph of the animal, sharp on the eyes, with a soft natural background.";
const PRODUCT = "A product photograph: the object alone, centred, on a plain softly lit backdrop with a gentle shadow.";
const CREATURES = ["animal", "bird", "person", "human"];

export const SUBJECTS = {
  // --- Food and drink ----------------------------------------------------------
  dish: { criteria: "A meal or a plate of food: restaurant dishes, recipes, takeaway, a menu.", shot: "Food photography: the dish plated, seen from above or at a low angle on a table, in soft daylight." },
  dessert: { criteria: "Something sweet or baked: cakes, pastries, ice cream, chocolate, bread, a bakery.", shot: "Food photography: the bake or sweet close up on a plate or a board, in soft daylight." },
  drink: { criteria: "A drink: coffee, tea, cocktails, wine, beer, juice, a bar or café menu.", shot: "Drink photography: the glass or cup close up on a counter or a table, with a softly blurred background." },
  produce: { criteria: "Fresh ingredients or groceries: fruit, vegetables, herbs, a market stall, a delivery box.", shot: "Fresh produce photographed close up, in a crate, on a board or on a market stall, in daylight." },
  // --- Places to be --------------------------------------------------------------
  venue: { criteria: "Somewhere people go out to: a restaurant, café, bar, shop or club, seen from inside or from the street.", shot: "An interior photograph of the venue, wide, in warm ambient light, with nobody posing for the camera." },
  stay: { criteria: "Somewhere to sleep: a hotel, a rental, a cabin, a villa, a resort, a bedroom.", shot: "A travel-listing photograph: the room or the building at its best, wide, bright and tidy." },
  home: { criteria: "A house or a building as property: homes for sale or rent, real estate, a neighbourhood.", shot: "A real-estate photograph: the building's exterior from the street, in daylight." },
  interior: { criteria: "A room or the things in it: furniture, decor, lighting, a kitchen, a workspace.", shot: "An interiors photograph: the furniture or the room in a styled home, in daylight." },
  city: { criteria: "A city: streets, skylines, neighbourhoods, nightlife, public transport, a destination that is a town.", shot: "A city photograph: a street or a skyline, with depth and atmosphere.", keywords: ["city", "urban", "town", "downtown", "metropolis", "skyline", "cityscape", "alley", "high rise", "street"], not: ["animal", "bird", "forest", "mountain"] },
  landmark: { criteria: "A notable building or sight: a monument, a museum, a temple, a bridge, a castle, an attraction.", shot: "A travel photograph of the landmark, the whole of it in frame against the sky.", keywords: ["monument", "landmark", "castle", "temple", "church", "cathedral", "bridge", "palace", "ruins", "dome", "lighthouse", "mosque", "pagoda"], not: ["animal", "bird"] },
  // --- The outdoors ------------------------------------------------------------
  beach: { criteria: "The coast: a beach, an island, the sea, a seaside destination, sailing.", shot: SCENE, keywords: ["beach", "coast", "shoreline", "island", "tropical", "lagoon", "bay", "palm tree", "seaside", "wave"], not: CREATURES },
  mountain: { criteria: "Mountains and high country: peaks, alpine valleys, trails with a view, ski country.", shot: SCENE, keywords: ["mountain", "mountain range", "peak", "alps", "valley", "summit", "cliff", "highland", "ridge"], not: CREATURES },
  woods: { criteria: "Woods and green country: forests, parks, fields, trails, gardens, countryside.", shot: SCENE, keywords: ["forest", "woodland", "jungle", "rainforest", "park", "trail", "countryside", "grassland", "meadow", "garden", "rural"], not: CREATURES },
  water: { criteria: "Fresh water: a lake, a river, a waterfall, a pond, fishing, paddling.", shot: SCENE, keywords: ["lake", "river", "waterfall", "pond", "stream", "creek", "fjord", "kayak", "canoe"], not: CREATURES },
  desert: { criteria: "Dry, open country: desert, dunes, canyons, badlands, a road through nowhere.", shot: SCENE, keywords: ["desert", "dune", "sand dune", "canyon", "mesa", "badlands", "arid"], not: [...CREATURES, "snow"] },
  winter: { criteria: "Snow and cold: winter landscapes, skiing, ice, the far north.", shot: SCENE, keywords: ["snow", "winter", "frost", "arctic", "blizzard", "glacier", "iceberg", "aurora"], not: CREATURES },
  sky: { criteria: "The sky: weather, clouds, sunsets, stars, the night sky, astronomy, flight.", shot: "A photograph of the sky alone, or of the sky over a low horizon.", keywords: ["cloud", "sunset", "weather", "storm", "lightning", "rainbow", "milky way", "starry sky", "moon", "nebula", "galaxy"], not: [...CREATURES, "building"] },
  // --- Living things -----------------------------------------------------------
  dog: { criteria: "A dog: pets, walkers, adoption, vets, training.", shot: "A pet portrait of the dog, sharp on the eyes, outdoors or at home.", keywords: ["dog", "puppy", "golden retriever", "labrador retriever", "husky", "bulldog", "terrier", "poodle", "corgi", "hound"] },
  cat: { criteria: "A cat or a kitten.", shot: "A pet portrait of the cat, sharp on the eyes, at home.", keywords: ["cat", "kitten", "tabby", "manx", "abyssinian"], not: ["lion", "tiger", "leopard", "wildlife", "cheetah"] },
  bird: { criteria: "A bird: birdwatching, a species guide, poultry, parrots.", shot: ANIMAL, keywords: ["parrot", "owl", "eagle", "finch", "hummingbird", "flamingo", "penguin", "duck", "swan", "kingfisher", "robin", "sparrow", "hawk", "puffin", "bird"] },
  wildlife: { criteria: "A wild animal: safaris, zoos, conservation, a species guide, sea life, insects.", shot: ANIMAL, keywords: ["lion", "tiger", "elephant", "giraffe", "zebra", "bear", "deer", "fox", "wolf", "monkey", "leopard", "whale", "dolphin", "turtle", "butterfly", "squirrel", "kangaroo", "rabbit", "shark", "wildlife"], not: ["dog", "cat", "pet"] },
  farm_animal: { criteria: "A horse or a farm animal: riding, stables, livestock, cattle, sheep.", shot: ANIMAL, keywords: ["horse", "stallion", "cow", "cattle", "sheep", "lamb", "goat", "pig", "chicken", "donkey", "alpaca", "llama"] },
  flower: { criteria: "Flowers: bouquets, florists, blossom, a flower guide.", shot: "A close photograph of the flowers, in soft light.", keywords: ["rose", "tulip", "daisy", "sunflower", "flower bouquet", "flower arrangement", "orchid", "lily", "peony", "dahlia", "cherry blossom", "lavender", "poppy", "flower"], not: [...CREATURES, "insect", "bee"] },
  plant: { criteria: "Plants and leaves: houseplants, gardening, succulents, herbs, a plant-care guide.", shot: "A photograph of the plant in its pot or its bed, in soft daylight.", keywords: ["potted plant", "houseplant", "succulent", "cactus", "fern", "aloe", "ivy", "moss", "leaf"], not: [...CREATURES, "insect", "flower", "blossom", "forest", "tree"] },
  // --- People --------------------------------------------------------------------
  portrait: { criteria: "One person, as a person: a professional, a host, a teacher, a match, an author, a contact with a photograph.", shot: "A close portrait photograph of one person, as on a profile: the face fills most of the frame, a friendly expression, a softly blurred background.", own: true },
  gathering: { criteria: "People together: an event, a party, a festival, a concert crowd, a team, a community, a wedding.", shot: "An event photograph: the crowd or the group in the moment, with the atmosphere of the place." },
  fitness: { criteria: "Exercise and sport: running, yoga, the gym, cycling, swimming, team sports, a class or a workout.", shot: "A sports photograph: someone mid-movement, in the gym, the studio or outdoors." },
  adventure: { criteria: "Doing things outdoors: hiking, camping, surfing, skiing, climbing, kayaking, a guided trip.", shot: "An outdoor-adventure photograph: a small figure doing it in a big landscape." },
  family: { criteria: "Children and family life: babies, kids, parenting, school, childcare.", shot: "A candid family photograph at home or outdoors, in warm light." },
  // --- Things ----------------------------------------------------------------------
  fashion: { criteria: "Things people wear: clothing, shoes, bags, jewellery, watches, glasses.", shot: PRODUCT },
  gadget: { criteria: "Electronics and devices: phones, laptops, cameras, headphones, speakers, smart-home kit.", shot: PRODUCT },
  vehicle: { criteria: "A car, a motorbike, a van or a truck: rentals, listings, rides, deliveries.", shot: "An automotive photograph: the vehicle three-quarters on, parked somewhere open." },
  bicycle: { criteria: "A bicycle or a scooter: bike shops, bike share, cycling routes.", shot: "The bicycle side on, leaning or standing, on a street or a trail." },
  transit: { criteria: "Getting there: planes, trains, boats, airports, stations, a journey or a ticket.", shot: "A travel photograph of the plane, train, boat or station." },
  book: { criteria: "Books and reading: a library, a bookshop, a reading list, study, stationery, writing.", shot: "A still life: the book or the stationery on a table or a shelf, in warm light." },
  music: { criteria: "Music: instruments, records, albums, a studio, a gig, a playlist.", shot: "A music photograph: the instrument, the record or the performer, in moody stage or studio light." },
  story: { criteria: "Something told or imagined: a story, a fairy tale, a chapter, a character, a game world, a dream, a guided meditation.", shot: "One scene from it: the main character in their setting, in the middle of a moment, with room around them." },
  film: { criteria: "Something to watch: films, series, shows, videos, a cinema.", shot: "A cinematic still in widescreen: one dramatic, atmospheric frame from the story, with no titles." },
  art: { criteria: "Art and making: paintings, illustration, sculpture, galleries, crafts, pottery, design work.", shot: "The artwork or the craft piece, shown plainly, as in a gallery or on the maker's bench." },
  tools: { criteria: "Work with the hands: tools, DIY, repairs, construction, a workshop, gardening kit, machinery.", shot: "The tools or the job in a workshop or on site, in practical light." },
  play: { criteria: "Play: toys, board games, video games, puzzles, hobbies for children and adults.", shot: "The toy or the game set out to be played with, bright and colourful." },
  care: { criteria: "Looking after yourself: skincare, cosmetics, perfume, a spa, a salon, wellness, medicine.", shot: "A beauty still life: the product or the treatment, clean and softly lit." },
  work: { criteria: "Work and study: an office, a desk, a meeting, a course, a classroom, a job.", shot: "A workplace photograph: the desk, the room or people at work, in daylight." },
  abstract: { criteria: "Nothing in particular: a texture, a pattern, a colour or a mood, for things with no physical look.", shot: "An abstract photograph: texture, light and colour, with no recognisable subject." },
} as const satisfies Record<string, Subject>;

export type SubjectName = keyof typeof SUBJECTS;
