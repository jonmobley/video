/**
 * Script to remove a specific video from the oz page
 * Video to remove: "Oz: Chorus and Kids Stage R" (wistiaId: 7kpm1d3mhv)
 */

const fetch = require('node-fetch');

async function removeVideo() {
    try {
        // First, fetch all videos from the oz page
        console.log('Fetching videos from oz page...');
        const getResponse = await fetch('https://vidsharepro.netlify.app/.netlify/functions/get-videos?page=oz');
        
        if (!getResponse.ok) {
            throw new Error(`Failed to fetch videos: ${getResponse.status}`);
        }
        
        const videos = await getResponse.json();
        console.log(`Found ${videos.length} videos on oz page`);
        
        // Find the video to remove
        const videoToRemove = videos.find(v => v.wistiaId === '7kpm1d3mhv');
        if (videoToRemove) {
            console.log(`Found video to remove: "${videoToRemove.title}"`);
        } else {
            console.log('Video "Oz: Chorus and Kids Stage R" not found!');
            return;
        }
        
        // Filter out the video we want to remove
        const updatedVideos = videos.filter(v => v.wistiaId !== '7kpm1d3mhv');
        console.log(`Videos after removal: ${updatedVideos.length}`);
        
        // Re-index the order of remaining videos
        updatedVideos.forEach((video, index) => {
            video.order = index;
        });
        
        // Save the updated list back to the server
        console.log('Saving updated video list...');
        const saveResponse = await fetch('https://vidsharepro.netlify.app/.netlify/functions/save-videos', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ videos: updatedVideos, page: 'oz' })
        });
        
        if (!saveResponse.ok) {
            throw new Error(`Failed to save videos: ${saveResponse.status}`);
        }
        
        const result = await saveResponse.json();
        console.log('Success!', result);
        console.log(`Video "Oz: Chorus and Kids Stage R" has been removed from the oz page.`);
        
    } catch (error) {
        console.error('Error:', error.message);
    }
}

// Run the removal
removeVideo();
