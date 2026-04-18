package logger

import (
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var Log *zap.SugaredLogger

func Init(environment string) error {
	var config zap.Config

	if environment == "production" {
		config = zap.NewProductionConfig()
	} else {
		config = zap.NewDevelopmentConfig()
		config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
	}

	logger, err := config.Build()
	if err != nil {
		return err
	}

	Log = logger.Sugar()
	return nil
}

func Sync() {
	if Log != nil {
		Log.Sync()
	}
}
