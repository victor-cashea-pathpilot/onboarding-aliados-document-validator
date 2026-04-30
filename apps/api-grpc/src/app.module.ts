import { Module } from '@nestjs/common';
import { grpcProviders } from './grpc.providers';
import { OnboardingGrpcController } from './onboarding-grpc.controller';

@Module({
  controllers: [OnboardingGrpcController],
  providers: [...grpcProviders],
})
export class AppModule {}
