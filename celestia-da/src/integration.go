package celestiada

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

type BatchMetadata struct {
	BatchNumber    uint64    `json:"batchNumber"`
	StateRoot      string    `json:"stateRoot"`
	Timestamp      time.Time `json:"timestamp"`
	TxCount        int       `json:"txCount"`
	CelestiaHeight uint64    `json:"celestiaHeight"`
	Commitment     string    `json:"commitment"`
}

type CDKIntegration struct {
	publisher      *Publisher
	metadataStore  sync.Map
	batchQueue     chan *BatchData
	ctx            context.Context
	cancel         context.CancelFunc
}

type BatchData struct {
	Number      uint64
	Data        []byte
	StateRoot   string
	TxCount     int
	ResultChan  chan PublishResult
}

type PublishResult struct {
	Success  bool
	RefID    string
	Error    error
	Metadata *BatchMetadata
}

func NewCDKIntegration(config Config) (*CDKIntegration, error) {
	publisher, err := NewPublisher(config)
	if err != nil {
		return nil, err
	}

	ctx, cancel := context.WithCancel(context.Background())
	
	integration := &CDKIntegration{
		publisher:  publisher,
		batchQueue: make(chan *BatchData, 100),
		ctx:        ctx,
		cancel:     cancel,
	}

	go integration.processBatches()
	
	return integration, nil
}

func (c *CDKIntegration) SubmitBatch(batchNumber uint64, data []byte, stateRoot string, txCount int) <-chan PublishResult {
	resultChan := make(chan PublishResult, 1)
	
	batch := &BatchData{
		Number:     batchNumber,
		Data:       data,
		StateRoot:  stateRoot,
		TxCount:    txCount,
		ResultChan: resultChan,
	}
	
	select {
	case c.batchQueue <- batch:
	case <-c.ctx.Done():
		resultChan <- PublishResult{
			Success: false,
			Error:   fmt.Errorf("CDK integration is shutting down"),
		}
	}
	
	return resultChan
}

func (c *CDKIntegration) processBatches() {
	for {
		select {
		case batch := <-c.batchQueue:
			c.processBatch(batch)
		case <-c.ctx.Done():
			return
		}
	}
}

func (c *CDKIntegration) processBatch(batch *BatchData) {
	start := time.Now()
	
	refID, err := c.publisher.PublishBatch(c.ctx, batch.Data)
	if err != nil {
		batch.ResultChan <- PublishResult{
			Success: false,
			Error:   fmt.Errorf("failed to publish batch %d: %w", batch.Number, err),
		}
		return
	}

	var height uint64
	var commitment string
	fmt.Sscanf(refID, "%d:%s", &height, &commitment)
	
	metadata := &BatchMetadata{
		BatchNumber:    batch.Number,
		StateRoot:      batch.StateRoot,
		Timestamp:      time.Now(),
		TxCount:        batch.TxCount,
		CelestiaHeight: height,
		Commitment:     commitment,
	}
	
	c.metadataStore.Store(batch.Number, metadata)
	
	batch.ResultChan <- PublishResult{
		Success:  true,
		RefID:    refID,
		Metadata: metadata,
	}
	
	duration := time.Since(start)
	fmt.Printf("Batch %d published to Celestia in %v (height: %d)\n", 
		batch.Number, duration, height)
}

func (c *CDKIntegration) GetBatchMetadata(batchNumber uint64) (*BatchMetadata, error) {
	value, ok := c.metadataStore.Load(batchNumber)
	if !ok {
		return nil, fmt.Errorf("metadata not found for batch %d", batchNumber)
	}
	
	metadata, ok := value.(*BatchMetadata)
	if !ok {
		return nil, fmt.Errorf("invalid metadata type for batch %d", batchNumber)
	}
	
	return metadata, nil
}

func (c *CDKIntegration) RetrieveBatchData(batchNumber uint64) ([]byte, error) {
	metadata, err := c.GetBatchMetadata(batchNumber)
	if err != nil {
		return nil, err
	}
	
	return c.publisher.RetrieveBatch(c.ctx, metadata.CelestiaHeight, metadata.Commitment)
}

func (c *CDKIntegration) ExportMetadata() ([]byte, error) {
	var allMetadata []*BatchMetadata
	
	c.metadataStore.Range(func(key, value interface{}) bool {
		if metadata, ok := value.(*BatchMetadata); ok {
			allMetadata = append(allMetadata, metadata)
		}
		return true
	})
	
	return json.MarshalIndent(allMetadata, "", "  ")
}

func (c *CDKIntegration) Close() error {
	c.cancel()
	close(c.batchQueue)
	return c.publisher.Close()
}