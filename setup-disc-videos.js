// Script to set up initial DISC videos
// This fetches video titles from Wistia and prepares them for the DISC page

const videos = [
  'vqb0pfo4zw',
  '5vqqwph6wq',
  'nujmnhh6fh',
  '1t2iqoeme2',
  'l6ub2gwc2r',
  '2gexsi52zj',
  '1cai4aoxq3',
  '3u992i78fk',
  '7i7k3gmrzh',
  '5emj65bgp7'
];

async function fetchWistiaTitle(wistiaId) {
  try {
    const response = await fetch(`https://fast.wistia.com/oembed?url=https://videosharepro.wistia.com/medias/${wistiaId}`);
    const data = await response.json();
    return data.title || `Video ${wistiaId}`;
  } catch (error) {
    console.error(`Error fetching title for ${wistiaId}:`, error);
    return `Video ${wistiaId}`;
  }
}

// Function to generate URL string (matches the logic in save-videos.js)
function generateVideoUrlString(wistiaId) {
  let hash = 0;
  for (let i = 0; i < wistiaId.length; i++) {
    const char = wistiaId.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  const positiveHash = Math.abs(hash);
  let urlString = positiveHash.toString(36);
  
  while (urlString.length < 6) {
    urlString = '0' + urlString;
  }
  
  return urlString.substring(0, 8);
}

async function setupDiscVideos() {
  console.log('Fetching video titles from Wistia...\n');
  
  const videoData = [];
  
  for (let i = 0; i < videos.length; i++) {
    const wistiaId = videos[i];
    const title = await fetchWistiaTitle(wistiaId);
    const urlString = generateVideoUrlString(wistiaId);
    
    videoData.push({
      id: wistiaId,
      wistiaId: wistiaId,
      title: title,
      category: 'disc',
      tags: ['disc'],
      urlString: urlString,
      order: i,
      page: 'disc'
    });
    
    console.log(`${i + 1}. ${title}`);
    console.log(`   Wistia ID: ${wistiaId}`);
    console.log(`   URL: /disc.html#${urlString}\n`);
  }
  
  console.log('\n--- Video Data for Admin Panel ---\n');
  console.log('You can add these videos through the admin panel (/admin.html):');
  console.log('1. Select "DISC" from the page dropdown');
  console.log('2. Add each video with its Wistia ID and title\n');
  
  console.log('\n--- SQL Insert Statement ---\n');
  console.log('Alternatively, you can run this SQL in Supabase:\n');
  
  const sqlValues = videoData.map(v => 
    `('${v.id}', '${v.wistiaId}', '${v.title.replace(/'/g, "''")}', '${v.category}', '{${v.tags.join(',')}}', '${v.urlString}', false, ${v.order}, 'disc')`
  ).join(',\n');
  
  console.log(`INSERT INTO videos (id, wistia_id, title, category, tags, url_string, featured, "order", page) VALUES`);
  console.log(sqlValues + ';');
  
  console.log('\n--- JSON Data ---\n');
  console.log(JSON.stringify(videoData, null, 2));
}

// Run the setup
setupDiscVideos().catch(console.error);
