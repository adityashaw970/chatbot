const { createClient } = require("@deepgram/sdk");
const fs = require("fs");
const path = require("path");

const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

async function transcribeAudio(audioBuffer, mimeType) {
  let tempFilePath = null;
  
  try {
    console.log(`Starting transcription: ${audioBuffer.length} bytes, type: ${mimeType}`);
    
    // Determine file extension from mimeType
    let extension = '.webm';
    if (mimeType.includes('wav')) extension = '.wav';
    else if (mimeType.includes('mp3')) extension = '.mp3';
    else if (mimeType.includes('ogg')) extension = '.ogg';
    else if (mimeType.includes('webm')) extension = '.webm';
    
    // Create temp directory if it doesn't exist
    const tempDir = path.join(__dirname, '../../temp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    
    // Save buffer to temporary file
    tempFilePath = path.join(tempDir, `audio_${Date.now()}${extension}`);
    fs.writeFileSync(tempFilePath, audioBuffer);
    
    console.log(`Temp audio file created: ${tempFilePath}`);
    
    // Read file for Deepgram
    const audioFile = fs.readFileSync(tempFilePath);
    
    console.log('Sending to Deepgram for transcription...');
    
    // Transcribe with Deepgram
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioFile,
      {
        model: "nova-2",
        smart_format: true,
        punctuate: true,
        utterances: true,
        diarize: true, // Enable speaker diarization
        language: "en",
        detect_language: false
      }
    );

    if (error) {
      console.error('Deepgram error:', error);
      throw new Error(`Deepgram error: ${error.message || JSON.stringify(error)}`);
    }

    console.log('Deepgram response received');
    
    // Extract transcript with speaker labels
    let transcript = "";
    
    if (result.results.utterances && result.results.utterances.length > 0) {
      console.log(`Found ${result.results.utterances.length} utterances`);
      
      // Format with speaker labels
      transcript = result.results.utterances.map(utterance => {
        const speaker = `Speaker ${utterance.speaker}`;
        return `${speaker}: ${utterance.transcript}`;
      }).join("\n\n");
      
    } else if (result.results.channels && 
               result.results.channels[0] && 
               result.results.channels[0].alternatives && 
               result.results.channels[0].alternatives[0] &&
               result.results.channels[0].alternatives[0].transcript) {
      
      console.log('Using simple transcript (no speaker diarization)');
      transcript = result.results.channels[0].alternatives[0].transcript;
      
    } else {
      console.log('No transcript found in response');
      throw new Error('No speech detected or transcription failed');
    }

    console.log(`Transcription successful: ${transcript.length} characters`);
    
    // Clean up temp file
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
      console.log('Temp file cleaned up');
    }
    
    return transcript;
    
  } catch (error) {
    console.error("Transcription service error:", error);
    
    // Clean up temp file on error
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      try {
        fs.unlinkSync(tempFilePath);
        console.log('Temp file cleaned up after error');
      } catch (unlinkError) {
        console.error("Error deleting temp file:", unlinkError);
      }
    }
    
    throw error;
  }
}

module.exports = transcribeAudio;