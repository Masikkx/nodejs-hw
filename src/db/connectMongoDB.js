import mongoose from 'mongoose';
import dns from 'node:dns';

export const connectMongoDB = async () => {
  try {
    const mongoUrl = process.env.MONGO_URL;
    const dnsServers = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
      .split(',')
      .map((server) => server.trim())
      .filter(Boolean);

    if (dnsServers.length > 0) {
      dns.setServers(dnsServers);
    }

    if (!mongoUrl) {
      throw new Error('MONGO_URL is not set');
    }

    await mongoose.connect(mongoUrl, {
      serverSelectionTimeoutMS: 10000,
      connectTimeoutMS: 10000,
    });
    console.log('✅ MongoDB connection established successfully');
  } catch (error) {
    console.error('❌ Failed to connect to MongoDB:', error.message);
    if (error.message.includes('querySrv')) {
      console.error(
        'ℹ️ SRV DNS lookup failed. Try setting DNS_SERVERS in .env, e.g. DNS_SERVERS=8.8.8.8,1.1.1.1',
      );
    }
    process.exit(1); // аварійне завершення програми
  }
};
