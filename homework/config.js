/**
 * Pepper & Olive Interiors — Client Design Homework
 * CONTENT MODEL (single source of truth)
 *
 * All titles, intros, labels, and notes are transcribed verbatim from
 * "Client Design Homework.pdf".
 *
 * Each option's image auto-resolves to  assets/img/{option.id}.jpg
 * selectionMode: 'single' | 'multi' | 'note'
 */
window.DESIGN_HOMEWORK_CONFIG = {
  schemaVersion: 6,
  business: 'Pepper & Olive Interiors',
  formTitle: 'Client Design Homework',

  welcome: {
    title: 'Welcome to Your Design Homework!',
    body:
      'Before we dive into designing, we want to get to know what you love, what you don\u2019t, and what feels like you. Working through these details upfront helps us align with your vision and make the design process more thoughtful, collaborative, and our favorite - efficient!\n\n' +
      'As you move through the slides, use the comment feature in Houzz to share your thoughts. You can also download the document and mark it up however you\u2019d like circle what you\u2019re drawn to, cross out what you\u2019re not, and add notes along the way.\n\n' +
      'At the end of each mini category, you\u2019ll find an underlined Client Feedback slide. This is where we\u2019d especially love your input. If you don\u2019t have a preference or something doesn\u2019t apply to your project just let us know. That\u2019s helpful information, too!\n\n' +
      'Don\u2019t overthink it. Go with your gut, have a little fun, and give us a peek inside your design brain.\n\n' +
      'We can\u2019t wait to dig into your feedback and start bringing your home to life!'
  },

  closing: {
    title: 'Next Steps',
    body:
      'Once you\u2019ve completed the Design Homework, our team will review it together to ensure that we\u2019re aligned with all of your design preferences prior to diving into the design phase of the project. We will be sure to reach out with any clarification questions that we may have.'
  },

  sections: [
    {
      id: 'aesthetic',
      index: '02',
      title: 'General Design Aesthetic',
      intro:
        'What you\u2019ll find in this part of the homework are nine different aesthetics that we specialize in. Of course we will tailor our design specifically to you, but this is a starting point so you can see (and share) which style you\u2019re most drawn to.',
      allowOmit: false,
      categories: [
        {
          id: 'styles',
          mood: true,
          title: 'Client Feedback on Aesthetic',
          selectionMode: 'single',
          options: [
            { id: 'style-midcentury', label: 'Midcentury Mod' },
            { id: 'style-quirky', label: 'Quirky in Color' },
            { id: 'style-rustic', label: 'Rustic Cottage' },
            { id: 'style-mountain', label: 'Modern Mountain' },
            { id: 'style-scandinavian', label: 'Scandinavian' },
            { id: 'style-organic', label: 'Organic Modern' },
            { id: 'style-european', label: 'Modern European' },
            { id: 'style-cali', label: 'Cali Casual' },
            { id: 'style-spanish', label: 'Spanifornia' }
          ]
        }
      ]
    },

    {
      id: 'finishes',
      index: '03',
      title: 'Finishes',
      intro:
        'What you\u2019ll find in this part of the homework are different finishes that are available in: cabinet and bath hardware, door hardware, and plumbing and lighting fixtures. We would like to see which you\u2019re drawn to most. Please don\u2019t pay attention to the styles of what you see and focus on what finish you\u2019re drawn to most.',
      allowOmit: false,
      categories: [
        {
          id: 'finish-types',
          mood: true,
          title: 'Different Types of Finishes',
          selectionMode: 'single',
          options: [
            { id: 'fin-brass', label: 'Brass' },
            { id: 'fin-nickel', label: 'Polished Nickel' },
            { id: 'fin-bronze', label: 'Bronze' }
          ]
        },
        {
          id: 'door-hardware-finish',
          title: 'Client Feedback on Door Hardware Finishes',
          selectionMode: 'single',
          options: [
            { id: 'dh-brass', label: 'Brass' },
            { id: 'dh-nickel', label: 'Polished Nickel' },
            { id: 'dh-bronze', label: 'Bronze' }
          ]
        },
        {
          id: 'door-hardware-style',
          title: 'Client Feedback on Door Hardware Styles: Knob vs Lever',
          selectionMode: 'single',
          options: [
            { id: 'dh-knob', label: 'Knob' },
            { id: 'dh-lever', label: 'Lever' }
          ]
        },
        {
          id: 'backplate-shape',
          title: 'Client Feedback on Door Hardware Styles: Backplate Shape',
          selectionMode: 'single',
          options: [
            { id: 'dh-square', label: 'Squared' },
            { id: 'dh-rect', label: 'Rectangular/Linear' },
            { id: 'dh-round', label: 'Rounded/Circular' },
            { id: 'dh-unique', label: 'Open to Unique Shapes' }
          ]
        }
      ]
    },

    {
      id: 'bathroom',
      index: '04',
      title: 'Bathroom Plumbing Fixtures',
      intro:
        'What you\u2019ll find in this part of the homework are different styles that are available in different plumbing fixtures. Please don\u2019t pay attention to the finish or the style of the fixture, just the application itself. We would like to see which you\u2019re drawn to most.',
      allowOmit: true,
      categories: [
        {
          id: 'bath-location',
          mood: true,
          title: 'Bathroom Plumbing Fixture Location',
          selectionMode: 'single',
          options: [
            { id: 'bp-wall-mount', label: 'Wall Mount Fixtures' },
            { id: 'bp-vanity-mount', label: 'Vanity Mount Fixtures' }
          ]
        },
        {
          id: 'bath-type',
          mood: true,
          title: 'Bathroom Plumbing Fixture Type',
          selectionMode: 'single',
          options: [
            { id: 'bp-single-hole', label: 'Single Hole Faucet' },
            { id: 'bp-widespread', label: 'Widespread Faucet' }
          ]
        },
        {
          id: 'bath-sinks',
          mood: true,
          title: 'Bathroom Sink Styles',
          selectionMode: 'single',
          options: [
            { id: 'bs-stone-front', label: 'Stone Front Sink', note: 'undermount sink with the sink front being finished in stone countertop material' },
            { id: 'bs-vessel', label: 'Vessel Sink' },
            { id: 'bs-trough', label: 'Stone Trough Sink' },
            { id: 'bs-integrated', label: 'Integrated Sink', note: 'countertop material is used to fabricate and finish the sink' },
            { id: 'bs-undermount', label: 'Undermount Sink' }
          ]
        }
      ]
    },

    {
      id: 'kitchen',
      index: '05',
      title: 'Kitchen Plumbing Fixtures',
      intro: '',
      allowOmit: true,
      categories: [
        {
          id: 'kitchen-faucets',
          title: 'Kitchen Faucet Types',
          selectionMode: 'single',
          options: [
            { id: 'kf-std-widespread', label: 'Standard Widespread' },
            { id: 'kf-widespread-spray', label: 'Widespread + Side Sprayer' },
            { id: 'kf-bridge', label: 'Bridge Faucet' },
            { id: 'kf-bridge-spray', label: 'Bridge Faucet with Side Sprayer' },
            { id: 'kf-gooseneck-2hole', label: '2 Hole Gooseneck + Integrated Sprayer' },
            { id: 'kf-gooseneck-integrated', label: 'Gooseneck + Integrated Sprayer' }
          ]
        },
        {
          id: 'kitchen-sinks',
          mood: true,
          title: 'Kitchen Sink Types',
          selectionMode: 'single',
          options: [
            { id: 'ks-farmhouse', label: 'Farmhouse (Apron Front) Sink' },
            { id: 'ks-undermount', label: 'Undermount Sink' },
            { id: 'ks-slab-front', label: 'Slab Front Sink' },
            { id: 'ks-slate', label: 'Slate Farmhouse Sink' },
            { id: 'ks-copper', label: 'Copper Farmhouse Sink' }
          ]
        },
        {
          id: 'pot-filler',
          title: 'Client Feedback: Kitchen Pot Filler',
          selectionMode: 'single',
          options: [
            { id: 'pot-filler', label: 'Pot Filler' },
            { id: 'no-pot-filler', label: 'No Pot Filler' }
          ]
        },
        {
          id: 'divider',
          title: 'Client Feedback on Divider or No Divider',
          selectionMode: 'single',
          options: [
            { id: 'divider', label: 'Divider' },
            { id: 'no-divider', label: 'No Divider' }
          ]
        },
        {
          id: 'drip-rail',
          title: 'Drip Rail Detail',
          help: 'wood or stone underneath the sink top to protect the lower cabinets under the sink from dripping water',
          selectionMode: 'note'
        }
      ]
    },

    {
      id: 'appliances',
      index: '06',
      title: 'Appliances',
      intro:
        'What you\u2019ll find in this part of the homework are different design details in regards to kitchen and laundry room appliances.',
      allowOmit: true,
      categories: [
        {
          id: 'laundry-orientation',
          title: 'Client Feedback on Laundry W/D Orientation',
          selectionMode: 'single',
          options: [
            { id: 'app-stacked', label: 'Stacked Washer and Dryer' },
            { id: 'app-side-by-side', label: 'Side by Side Washer and Dryer' }
          ]
        },
        {
          id: 'paneled',
          mood: true,
          title: 'Paneled Appliances versus Non Paneled',
          selectionMode: 'single',
          options: [
            { id: 'app-non-paneled', label: 'Non Paneled Kitchen Appliances' },
            { id: 'app-paneled', label: 'Paneled Kitchen Appliances' }
          ]
        },
        {
          id: 'range-vs-cooktop',
          mood: true,
          title: 'Range Oven versus Cooktop / Wall Oven Combo',
          selectionMode: 'single',
          options: [
            { id: 'app-range', label: 'Range Oven' },
            { id: 'app-cooktop', label: 'Cooktop + Wall Oven Combo' }
          ]
        },
        {
          id: 'island-planning',
          mood: true,
          title: 'Kitchen Island Appliance Planning',
          selectionMode: 'single',
          options: [
            { id: 'app-none-island', label: 'No Appliances in Island' },
            { id: 'app-sink-island', label: 'Sink in Island' },
            { id: 'app-range-island', label: 'Range / Cooktop in Island' }
          ]
        },
        {
          id: 'misc-appliances',
          mood: true,
          title: 'Miscellaneous Appliances to Incorporate',
          selectionMode: 'single',
          options: [
            { id: 'app-wine', label: 'Wine Fridge' },
            { id: 'app-ice', label: 'Pebble Ice Maker' },
            { id: 'app-bev-drawers', label: 'Beverage Drawers' }
          ]
        },
        {
          id: 'existing-appliances',
          title: 'Existing / Reused Appliance Model Numbers',
          help: 'If you already own appliances for this project, or if we\u2019ll be reusing your existing appliances, please list each appliance type and its model number (for example: Refrigerator - GE PVD28BYNFS).',
          selectionMode: 'note'
        },
        {
          id: 'appliance-brands',
          title: 'Preferred Appliance Brands',
          help: 'List any appliance brands you prefer (for example: Sub-Zero, Wolf, Thermador, Miele, Bosch, Viking).',
          selectionMode: 'note'
        },
        {
          id: 'appliance-series',
          title: 'Preferred Appliance Series',
          help: 'List any specific appliance series or product lines you love (for example: Wolf M Series, Sub-Zero Designer Series, Thermador Pro Harmony).',
          selectionMode: 'note'
        },
        {
          id: 'appliance-sizes',
          title: 'Preferred Appliance Sizes',
          help: 'Note any appliance sizes you have in mind (for example: 36" range, 48" built-in refrigerator, 24" dishwasher, 30" cooktop).',
          selectionMode: 'note'
        }
      ]
    },

    {
      id: 'laundry-cabinets',
      index: '07',
      title: 'Laundry & Cabinets',
      allowOmit: true,
      categories: [
        {
          id: 'laundry-solutions',
          title: 'Client Feedback on Laundry Solutions',
          selectionMode: 'single',
          options: [
            { id: 'laundry-flat-dry-pullouts', label: 'Flat Lay Dry Pull-Outs' },
            { id: 'laundry-hanging', label: 'Hanging Rod' }
          ]
        },
        {
          id: 'cabinet-design',
          mood: true,
          title: 'Kitchen Cabinet Design',
          selectionMode: 'single',
          options: [
            { id: 'cab-all-wood', label: 'All Wood' },
            { id: 'cab-light', label: 'Paint Grade - Light' },
            { id: 'cab-dark', label: 'Paint Grade - Dark' },
            { id: 'cab-color', label: 'Paint Grade - Color' },
            { id: 'cab-mix-light-dark', label: 'A Mix of Light and Dark' },
            { id: 'cab-mix-paint-stain', label: 'A Mix of Paint Grade / Stain Grade' }
          ]
        },
        {
          id: 'storage-upper',
          title: 'Client Feedback: Kitchen Storage',
          selectionMode: 'single',
          options: [
            { id: 'stor-glass-grid', label: 'Glass with Grid' },
            { id: 'stor-integrated-open-shelving', label: 'Integrated Open Shelving' },
            { id: 'stor-ribbed-fluted', label: 'Ribbed / Fluted Glass' },
            { id: 'stor-standard-glass', label: 'Standard Glass Fronts' },
            { id: 'stor-open-shelving', label: 'Open Shelving' }
          ]
        },
        {
          id: 'storage-pots-pans',
          mood: true,
          title: 'Client Feedback on Kitchen Storage (Pots and Pans)',
          selectionMode: 'single',
          options: [
            { id: 'stor-pullout', label: 'With Pull-Out Drawers' }
          ]
        },
        {
          id: 'storage-spices',
          title: 'Client Feedback on Kitchen Storage (Spices)',
          selectionMode: 'single',
          options: [
            { id: 'spice-vertical', label: 'Vertical Pull Out' },
            { id: 'spice-lay-flat', label: 'Lay Flat (in Drawer)' },
            { id: 'spice-niche', label: 'Spice Niche (in Alcove)' }
          ]
        }
      ]
    },

    {
      id: 'hoods-cooking',
      index: '08',
      title: 'Hoods & Cooking',
      allowOmit: true,
      categories: [
        {
          id: 'hood-styles',
          title: 'Kitchen Hood Styles',
          selectionMode: 'single',
          options: [
            { id: 'hood-plaster', label: 'Plaster' },
            { id: 'hood-paneled', label: 'Paneled' },
            { id: 'hood-millwork', label: 'Millwork' },
            { id: 'hood-architectural-trim', label: 'Architectural Plaster + Trim' },
            { id: 'hood-tiled', label: 'Tiled' },
            { id: 'hood-stone-slab', label: 'Stone Slab' },
            { id: 'hood-zinc', label: 'Zinc' },
            { id: 'hood-reclaimed-wood', label: 'Reclaimed Wood Trim' }
          ]
        },
        {
          id: 'hood-application',
          mood: true,
          title: 'Kitchen Hood Application Styles',
          selectionMode: 'single',
          options: [
            { id: 'hoodapp-wall', label: 'Wall Mount Hood' },
            { id: 'hoodapp-alcove', label: 'Range Alcove' }
          ]
        },
      ]
    },

    {
      id: 'countertops-stone',
      index: '09',
      title: 'Countertops & Stone',
      allowOmit: true,
      categories: [
        {
          id: 'natural-stone',
          mood: true,
          title: 'Natural Stone (Countertops)',
          selectionMode: 'single',
          options: [
            { id: 'nat-marble', label: 'Marble' },
            { id: 'nat-quartzite', label: 'Quartzite' },
            { id: 'nat-soapstone', label: 'Soapstone' }
          ]
        },
        {
          id: 'manufactured-stone',
          mood: true,
          title: 'Manufactured Stone (Countertops)',
          selectionMode: 'single',
          options: [
            { id: 'manu-porcelain', label: 'Porcelain' },
            { id: 'manu-quartz', label: 'Quartz / Ceasarstone' },
            { id: 'manu-concrete', label: 'Concrete' },
            { id: 'manu-terrazzo', label: 'Terrazzo' }
          ]
        },
        {
          id: 'countertop-edge',
          title: 'Client Feedback on Countertop Edge Profile',
          selectionMode: 'single',
          options: [
            { id: 'edge-eased', label: 'Eased' },
            { id: 'edge-rounded-top-bottom', label: 'Rounded Top & Bottom' },
            { id: 'edge-quarter-round', label: '1/4" Round' },
            { id: 'edge-matched-bevel', label: 'Matched Bevel' },
            { id: 'edge-quarter-bevel', label: '1/4" Bevel' },
            { id: 'edge-half-bevel', label: '1/2" Bevel' },
            { id: 'edge-flat-ogee', label: 'Flat Ogee' },
            { id: 'edge-ogee', label: 'Ogee' },
            { id: 'edge-bullnose-ogee', label: 'Bullnose Ogee' },
            { id: 'edge-cove-ogee', label: 'Cove Ogee' },
            { id: 'edge-cove', label: 'Cove' },
            { id: 'edge-cove-dupont', label: 'Cove Dupont' },
            { id: 'edge-half-bullnose', label: 'Half Bullnose' },
            { id: 'edge-demi-bullnose', label: 'Demi Bullnose' },
            { id: 'edge-full-bullnose', label: 'Full Bullnose' },
            { id: 'edge-hollywood-bevel', label: 'Hollywood Bevel' },
            { id: 'edge-waterfall', label: 'Waterfall' },
            { id: 'edge-dupont', label: 'Dupont' }
          ]
        }
      ]
    },

    {
      id: 'fireplace-tile',
      index: '10',
      title: 'Fireplace & Tile',
      allowOmit: true,
      categories: [
        {
          id: 'fireplace-material',
          mood: true,
          title: 'Fireplace Material',
          selectionMode: 'single',
          options: [
            { id: 'fireplace-plaster', label: 'Plaster' },
            { id: 'fireplace-slab', label: 'Slab' },
            { id: 'fireplace-tile', label: 'Tile' },
            { id: 'fireplace-mix', label: 'Mix of Materials' },
            { id: 'fireplace-millwork', label: 'Millwork' },
            { id: 'fireplace-stone-brick', label: 'Stone / Brick' }
          ]
        },
        {
          id: 'tile-edging',
          mood: true,
          title: 'Tile Edging Preference',
          selectionMode: 'single',
          options: [
            { id: 'edge-miter', label: 'Miter' },
            { id: 'edge-trim', label: 'Trim Piece' },
            { id: 'edge-double-drywall', label: 'Double Drywall', note: 'tile edge is flush with wall' }
          ]
        }
      ]
    },

    {
      id: 'color-wallcoverings',
      index: '11',
      title: 'Color & Wallcoverings',
      allowOmit: true,
      categories: [
        {
          id: 'use-of-color',
          mood: true,
          title: 'Use of Color',
          selectionMode: 'single',
          options: [
            { id: 'color-colorful', label: 'Colorful Interiors' },
            { id: 'color-neutral', label: 'Neutral Interiors' }
          ]
        },
        {
          id: 'wallpaper',
          mood: true,
          title: 'Types of Wallpaper',
          selectionMode: 'single',
          options: [
            { id: 'wallpaper-modern', label: 'Modern Wallpapers' },
            { id: 'wallpaper-calming', label: 'Calming Wallpapers' },
            { id: 'wallpaper-colorful', label: 'Colorful Wallpapers' }
          ]
        },
        {
          id: 'carpet',
          title: 'Client Feedback on Use of Carpet (or not)',
          help: 'Please specify which locations if you\u2019d like to use',
          selectionMode: 'note'
        },
        {
          id: 'tongue-groove',
          mood: true,
          title: 'Tongue and Groove Preferences',
          selectionMode: 'single',
          options: [
            { id: 'tg-vertical', label: 'Vertical' },
            { id: 'tg-horizontal', label: 'Horizontal' }
          ]
        },
        {
          id: 'interior-paint',
          mood: true,
          title: 'Types of Interior Paint',
          selectionMode: 'single',
          options: [
            { id: 'paint-standard', label: 'Standard Paint' },
            { id: 'paint-limewash', label: 'Limewash / Plaster Paint' }
          ]
        },
      ]
    },

    {
      id: 'lighting',
      index: '12',
      title: 'Lighting',
      allowOmit: true,
      categories: [
        {
          id: 'lighting-styles',
          mood: true,
          title: 'Lighting Styles',
          selectionMode: 'single',
          options: [
            { id: 'light-recessed', label: 'Recessed Lighting' },
            { id: 'light-semiflush', label: 'Semiflush Lighting' }
          ]
        },
        {
          id: 'bathroom-lighting',
          mood: true,
          title: 'Lighting Types in Bathroom',
          selectionMode: 'single',
          options: [
            { id: 'bl-pendant', label: 'Pendant in the Bathroom' },
            { id: 'bl-sconce', label: 'Wall Sconce in the Bathroom' }
          ]
        },
        {
          id: 'bedroom-ceiling-light',
          mood: true,
          title: 'Ceiling Light Preference in Bedrooms',
          selectionMode: 'single',
          options: [
            { id: 'bed-fan', label: 'Ceiling Fan' },
            { id: 'bed-fixture', label: 'Light Fixture' }
          ]
        },
        {
          id: 'specialty-switches',
          title: 'Client Feedback on Specialty Light Switches + Outlet Covers',
          selectionMode: 'single',
          options: [
            { id: 'switch-oil-rubbed-bronze', label: 'Oil Rubbed Bronze' },
            { id: 'switch-brass', label: 'Brass' }
          ]
        }
      ]
    },

    {
      id: 'flooring',
      index: '13',
      title: 'Flooring',
      allowOmit: true,
      categories: [
        {
          id: 'flooring-types',
          title: 'Client Feedback on Flooring Types',
          selectionMode: 'single',
          options: [
            { id: 'floor-real-hardwood', label: 'Real Hardwood' },
            { id: 'floor-engineered-hardwood', label: 'Engineered Hardwood' }
          ]
        },
        {
          id: 'hardwood-tones',
          mood: true,
          title: 'Hardwood Flooring Tones',
          selectionMode: 'single',
          options: [
            { id: 'tone-light', label: 'Light' },
            { id: 'tone-medium', label: 'Medium' },
            { id: 'tone-dark', label: 'Dark' }
          ]
        },
        {
          id: 'flooring-install',
          mood: true,
          title: 'Flooring Installation',
          selectionMode: 'single',
          options: [
            { id: 'install-herringbone', label: 'Herringbone' },
            { id: 'install-standard', label: 'Standard Install' }
          ]
        }
      ]
    },

    {
      id: 'ceiling-trim',
      index: '14',
      title: 'Ceiling & Trim',
      allowOmit: true,
      categories: [
        {
          id: 'ceiling-details',
          mood: true,
          title: 'Ceiling Design Details',
          selectionMode: 'single',
          options: [
            { id: 'ceil-wood-beams', label: 'Wood Beams' },
            { id: 'ceil-wood-paneling', label: 'Wood Paneling' },
            { id: 'ceil-paint-beams', label: 'Paint Grade Beams' },
            { id: 'ceil-paint-tg', label: 'Paint Grade T & G' }
          ]
        },
        {
          id: 'crown-molding',
          mood: true,
          title: 'Crown Molding Design',
          selectionMode: 'single',
          options: [
            { id: 'crown-traditional', label: 'Traditional' },
            { id: 'crown-modern', label: 'Modern' },
            { id: 'crown-none', label: 'No Crown Molding' }
          ]
        },
        {
          id: 'baseboard-options',
          title: 'Baseboard + Trim Options',
          selectionMode: 'single',
          options: [
            { id: 'baseboard-traditional', label: 'Traditional' },
            { id: 'baseboard-modern', label: 'Modern' }
          ]
        },
        {
          id: 'baseboard-design',
          title: 'Client Feedback: Baseboard + Trim Design',
          selectionMode: 'single',
          options: [
            { id: 'baseboard-contrast', label: 'Contrast' },
            { id: 'baseboard-stain', label: 'Stain Grade' },
            { id: 'baseboard-white', label: 'White' }
          ]
        }
      ]
    },

    {
      id: 'doors-stairs',
      index: '15',
      title: 'Doors & Stairs',
      allowOmit: true,
      categories: [
        {
          id: 'interior-doors',
          title: 'Paint vs. Stain Grade Doors',
          selectionMode: 'single',
          options: [
            { id: 'idoor-stain', label: 'Stain Grade' },
            { id: 'idoor-paint', label: 'Paint Grade' }
          ]
        },
        {
          id: 'front-door-options',
          title: 'Client Feedback: Front Door Design Options',
          selectionMode: 'single',
          options: [
            { id: 'fd-french', label: 'French Doors' },
            { id: 'fd-dutch', label: 'Dutch Door' },
            { id: 'fd-pivot', label: 'Pivot Door' },
            { id: 'fd-sidelites', label: 'Door(s) with One or Two Sidelites' },
            { id: 'fd-single-swing', label: 'Single Swing Door' },
            { id: 'fd-arched', label: 'Arched Door' }
          ]
        },
        {
          id: 'front-door-glass',
          title: 'Door with Glass vs Without',
          selectionMode: 'single',
          options: [
            { id: 'fd-with-glass', label: 'With Glass' },
            { id: 'fd-without-glass', label: 'Without Glass' }
          ]
        },
        {
          id: 'front-door-material',
          mood: true,
          title: 'Front Door Material',
          selectionMode: 'single',
          options: [
            { id: 'fd-stain', label: 'Stain Grade' },
            { id: 'fd-paint', label: 'Paint Grade' },
            { id: 'fd-metal-glass', label: 'Metal + Glass' }
          ]
        },
        {
          id: 'spindle-finishes',
          mood: true,
          title: 'Stairway (Spindle) Finishes',
          selectionMode: 'single',
          options: [
            { id: 'spindle-iron', label: 'Iron' },
            { id: 'spindle-wood', label: 'Wood' },
            { id: 'spindle-plaster', label: 'Plaster' }
          ]
        },
        {
          id: 'stair-design',
          mood: true,
          title: 'Stair Design',
          selectionMode: 'single',
          options: [
            { id: 'stair-wood-wood', label: 'Wood Treads, Wood Risers' },
            { id: 'stair-wood-white', label: 'Wood Treads, White Risers' },
            { id: 'stair-wood-carpet', label: 'Wood Treads & Risers + Carpet Runner' }
          ]
        }
      ]
    }
  ],

  budget: {
    index: '16',
    // 'rooms' = budget by room (below) | 'tiers' = the original per-item page.
    // Set this back to 'tiers' to restore the original page exactly.
    mode: 'rooms',
    title: 'Budget by Room',
    originalTitle: 'Budget Definition',
    intro: '',

    // ── Original page (mode: 'tiers') — left untouched for easy revert ────
    categories: [
      { id: 'plumbing-kitchen', label: 'Plumbing Fixture - Kitchen / Pantry', tiers: ['$500-$1,500', '$1,500-$3,000', '$3,000-$7,000+'] },
      { id: 'plumbing-baths', label: 'Plumbing Fixture - Bathrooms Throughout', tiers: ['$300-$600', '$600-$2,000', '$2,000-$7,000+'] },
      { id: 'plumbing-laundry', label: 'Plumbing Fixture - Laundry', tiers: ['$500-$1,500', '$1,500-$3,000', '$3,000-$7,000+'] },
      { id: 'plumbing-primary', label: 'Plumbing Fixture - Primary Bathroom', tiers: ['$300-$600', '$600-$2,000', '$2,000-$7,000+'] },
      { id: 'light-kitchen', label: 'Light Fixture - Kitchen', tiers: ['$200-$1,500', '$1,500-$5,000', '$5,000-$10,000+'] },
      { id: 'light-dining', label: 'Light Fixture - Dining / Living Room', tiers: ['$200-$1,500', '$1,500-$5,000', '$5,000-$10,000+'] },
      { id: 'light-baths', label: 'Light Fixture - Bathrooms', tiers: ['$200-$1,500', '$1,500-$5,000', '$5,000-$10,000+'] },
      { id: 'light-bedrooms', label: 'Light Fixture - Bedrooms', tiers: ['$200-$1,500', '$1,500-$5,000', '$5,000-$10,000+'] },
      { id: 'light-exterior', label: 'Light Fixture - Exterior', tiers: ['$200-$1,500', '$1,500-$5,000', '$5,000-$10,000+'] },
      { id: 'wood-flooring', label: 'Wood Flooring, Price per Sqft', tiers: ['$3-$7', '$7-$12', '$12-$15+'] },
      { id: 'tile', label: 'Tile, Price per Sqft', tiers: ['$5-$15', '$15-$25', '$25+'] },
      { id: 'stone-slab', label: 'Stone, per Slab', tiers: ['$1,500-$3,000', '$3,000-$8,000', '$8,000+'] }
    ],

    // ── Budget by room (mode: 'rooms') ──────────────────────────────────
    // Ranges offered for every room — EDIT THESE to your real ranges. A room
    // can override them by giving that room its own `tiers: [...]`.
    roomTiers: ['Under $10K', '$10K-$25K', '$25K-$50K', '$50K-$100K', '$100K+'],

    // Rooms to budget. A client picks a range above, or types their own amount.
    // Any room can override the shared list with its own `tiers: [...]`.
    rooms: [
      { id: 'kitchen', label: 'Kitchen' },
      { id: 'mess-kitchen', label: 'Mess Kitchen' },
      { id: 'pantry', label: 'Pantry' },
      { id: 'appliance-package', label: 'Appliance Package', tiers: ['Mid Level ($15K-$30K)', 'High Level ($30K-$75K+)'] },
      { id: 'living', label: 'Living Room' },
      { id: 'dining', label: 'Dining Room' },
      { id: 'family', label: 'Family Room' },
      { id: 'primary', label: 'Primary Bedroom' },
      { id: 'primary-bath', label: 'Primary Bath' },
      { id: 'secondary', label: 'Secondary Bedroom' },
      { id: 'secondary-bath', label: 'Secondary Bath' },
      { id: 'powder-bath', label: 'Powder Bath', tiers: ['Under $5K', '$5K-$10K', '$10K-$20K', '$20K+'] },
      { id: 'laundry', label: 'Laundry' },
      { id: 'office', label: 'Office / Study' },
      { id: 'exterior', label: 'Exterior / Outdoor' },
      { id: 'whole-home', label: 'Whole Home / Other' }
    ]
  }
};
