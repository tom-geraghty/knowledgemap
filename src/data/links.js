// Link definitions — the connections between nodes.
//
// strength: 1 = loosely related, 2 = related, 3 = closely related / directly referenced
// Add each link once only — duplicates will trigger a validation warning.

export const RAW_LINKS = [

  // Kubrick trilogy
  { source: "2001",             target: "the-shining",      strength: 3 }, // same director
  { source: "2001",             target: "clockwork-orange", strength: 3 }, // same director
  { source: "the-shining",      target: "clockwork-orange", strength: 2 }, // same director

  // Hitchcock
  { source: "vertigo",          target: "psycho",           strength: 3 }, // same director, same year
  { source: "vertigo",          target: "the-birds",        strength: 2 }, // same director
  { source: "psycho",           target: "the-birds",        strength: 2 }, // same director

  // Tarkovsky
  { source: "stalker",          target: "solaris",          strength: 3 }, // same director
  { source: "2001",             target: "solaris",          strength: 3 }, // Solaris as direct response to 2001
  { source: "2001",             target: "stalker",          strength: 2 }, // shared sci-fi / humanist terrain

  // Coppola
  { source: "apocalypse-now",   target: "the-conversation", strength: 3 }, // same director
  { source: "the-conversation", target: "vertigo",          strength: 2 }, // paranoia, surveillance, wrong interpretation

  // Ridley Scott
  { source: "blade-runner",     target: "alien",            strength: 3 }, // same director
  { source: "blade-runner",     target: "2001",             strength: 2 }, // sci-fi lineage, consciousness
  { source: "alien",            target: "the-shining",      strength: 2 }, // horror, institutional betrayal

  // New Wave connections
  { source: "breathless",       target: "eight-and-a-half", strength: 3 }, // New Wave contemporaries
  { source: "breathless",       target: "nashville",        strength: 2 }, // fragmented, anti-classical narrative
  { source: "eight-and-a-half", target: "nashville",        strength: 2 }, // ensemble, self-referential
  { source: "breathless",       target: "the-graduate",     strength: 2 }, // youth alienation, New Wave influence
  { source: "the-graduate",     target: "nashville",        strength: 2 }, // American disillusionment

  // Humanist cluster
  { source: "persona",          target: "stalker",          strength: 2 }, // slow cinema, identity, interiority
  { source: "persona",          target: "rashomon",         strength: 2 }, // truth, identity, unreliable perspective
  { source: "rashomon",         target: "the-conversation", strength: 2 }, // contested truth, interpretation
  { source: "persona",          target: "repulsion",        strength: 2 }, // psychological disintegration, women
  { source: "apocalypse-now",   target: "rashomon",         strength: 1 }, // moral ambiguity, truth under pressure

  // Horror connections
  { source: "psycho",           target: "repulsion",        strength: 3 }, // psychological horror, domestic space
  { source: "repulsion",        target: "dont-look-now",    strength: 2 }, // psychological horror, grief, women
  { source: "dont-look-now",    target: "the-birds",        strength: 2 }, // dread without explanation
  { source: "the-shining",      target: "dont-look-now",    strength: 2 }, // grief, premonition, dread

  // Sci-fi / dystopia
  { source: "brazil",           target: "clockwork-orange", strength: 3 }, // dystopia, state control
  { source: "brazil",           target: "blade-runner",     strength: 2 }, // dystopian futures, dark vision
  { source: "brazil",           target: "alien",            strength: 1 }, // corporate indifference

  // Cross-cluster
  { source: "2001",             target: "persona",          strength: 2 }, // interiority, consciousness, slow cinema
  { source: "apocalypse-now",   target: "blade-runner",     strength: 1 }, // darkness of human nature
  { source: "eight-and-a-half", target: "persona",          strength: 2 }, // identity, performance, inner life

];
