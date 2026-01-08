// src/service/ocr.service.js
// const vision = require('@google-cloud/vision');
// const path = require('path');
// const fs = require('fs').promises;

// class OCRService {
//   constructor() {
//     this.visionClient = null;
//     this.initializeGoogleVision();
//   }

//   /**
//    * Initialize Google Vision API
//    */
//   initializeGoogleVision() {
//     try {
//       // Use the service account key file path
//       const keyFilePath = path.join(__dirname, '../../google-vision-credentials.json');
      
//       // Check if credentials file exists
//       if (require('fs').existsSync(keyFilePath)) {
//         this.visionClient = new vision.ImageAnnotatorClient({
//           keyFilename: keyFilePath
//         });
//         console.log('✅ Google Vision initialized with credentials file');
//       } else {
//         console.error('❌ Google Vision credentials file not found at:', keyFilePath);
//         console.log('   Please ensure google-vision-credentials.json exists in the project root');
//       }
//     } catch (error) {
//       console.error('❌ Google Vision initialization failed:', error.message);
//       this.visionClient = null;
//     }
//   }

//   /**
//    * Main OCR function - uses Google Vision API
//    */
//   async extractText(imageData) {
//     console.log('🔍 Starting OCR extraction with Google Vision...');

//     try {
//       // Check if online first
//       const online = await this.isOnline();
//       if (!online) {
//         return {
//           success: false,
//           error: 'No internet connection. Google Vision requires internet access.',
//           text: ''
//         };
//       }

//       // Check if Vision client is initialized
//       if (!this.visionClient) {
//         return {
//           success: false,
//           error: 'Google Vision not initialized. Check credentials file.',
//           text: ''
//         };
//       }

//       // Perform OCR
//       const result = await this.googleVisionOCR(imageData);
      
//       if (result.success) {
//         console.log(`✅ Google Vision extracted ${result.length} characters`);
//       } else {
//         console.error('❌ OCR failed:', result.error);
//       }
      
//       return result;

//     } catch (error) {
//       console.error('❌ OCR extraction failed:', error);
//       return {
//         success: false,
//         error: error.message,
//         text: ''
//       };
//     }
//   }

//   /**
//    * Google Vision OCR with enhanced text detection
//    */
//   async googleVisionOCR(imageData) {
//     try {
//       // Remove data URL prefix if present
//       const base64Data = imageData.replace(/^data:image\/\w+;base64,/, '');
//       const imageBuffer = Buffer.from(base64Data, 'base64');

//       // Perform text detection with document text detection for better accuracy
//       const [result] = await this.visionClient.documentTextDetection({
//         image: { content: imageBuffer }
//       });

//       const fullTextAnnotation = result.fullTextAnnotation;
      
//       if (!fullTextAnnotation || !fullTextAnnotation.text) {
//         // Fallback to regular text detection if document detection returns nothing
//         const [textResult] = await this.visionClient.textDetection({
//           image: { content: imageBuffer }
//         });

//         const detections = textResult.textAnnotations;
        
//         if (!detections || detections.length === 0) {
//           return {
//             success: false,
//             error: 'No text found in image',
//             text: ''
//           };
//         }

//         // First annotation contains full text
//         const fullText = detections[0].description;

//         return {
//           success: true,
//           text: fullText.trim(),
//           length: fullText.trim().length,
//           service: 'google-vision',
//           confidence: 'standard'
//         };
//       }

//       // Use document text detection result (more accurate for documents)
//       const extractedText = fullTextAnnotation.text;

//       return {
//         success: true,
//         text: extractedText.trim(),
//         length: extractedText.trim().length,
//         service: 'google-vision-document',
//         confidence: 'high'
//       };

//     } catch (error) {
//       console.error('Google Vision error:', error);
      
//       // Provide more specific error messages
//       let errorMessage = error.message;
//       if (error.code === 3) {
//         errorMessage = 'Invalid image format. Please use PNG, JPEG, or other supported formats.';
//       } else if (error.code === 7) {
//         errorMessage = 'API key or credentials are invalid. Please check your service account.';
//       } else if (error.code === 8) {
//         errorMessage = 'Resource exhausted. You may have exceeded your API quota.';
//       }

//       return {
//         success: false,
//         error: errorMessage,
//         text: ''
//       };
//     }
//   }

//   /**
//    * Check if device is online
//    */
//   async isOnline() {
//     try {
//       const dns = require('dns').promises;
//       await dns.resolve('www.google.com');
//       return true;
//     } catch (error) {
//       console.warn('⚠️  No internet connection detected');
//       return false;
//     }
//   }

//   /**
//    * Test the OCR service with a sample image
//    */
//   async testOCR() {
//     console.log('\n=== Testing OCR Service ===');
    
//     // Test internet connection
//     const online = await this.isOnline();
//     console.log(`Internet: ${online ? '✅ Connected' : '❌ Offline'}`);
    
//     // Test Vision client
//     console.log(`Vision Client: ${this.visionClient ? '✅ Initialized' : '❌ Not initialized'}`);
    
//     return {
//       online,
//       visionReady: !!this.visionClient
//     };
//   }
// }

// // Create singleton instance
// const ocrService = new OCRService();

// // Test on startup
// ocrService.testOCR().then(status => {
//   if (status.online && status.visionReady) {
//     console.log('✅ OCR Service ready for use');
//   } else {
//     console.warn('⚠️  OCR Service has issues. Check logs above.');
//   }
// });

// module.exports = ocrService;