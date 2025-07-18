package celestiada

import (
	"context"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/celestiaorg/celestia-openrpc/types/blob"
	"github.com/celestiaorg/celestia-openrpc/types/share"
	client "github.com/celestiaorg/celestia-openrpc/types/client"
)

type Config struct {
	Endpoint     string
	NamespaceID  string
	AuthToken    string
	GasPrice     float64
	MaxBlobSize  uint64
	SubmitTimeout time.Duration
}

type Publisher struct {
	client      *client.Client
	namespace   share.Namespace
	config      Config
}

func NewPublisher(config Config) (*Publisher, error) {
	namespace, err := hex.DecodeString(config.NamespaceID)
	if err != nil {
		return nil, fmt.Errorf("invalid namespace ID: %w", err)
	}

	client, err := client.NewClient(context.Background(), config.Endpoint, config.AuthToken)
	if err != nil {
		return nil, fmt.Errorf("failed to create Celestia client: %w", err)
	}

	return &Publisher{
		client:    client,
		namespace: share.Namespace(namespace),
		config:    config,
	}, nil
}

func (p *Publisher) PublishBatch(ctx context.Context, batchData []byte) (string, error) {
	if uint64(len(batchData)) > p.config.MaxBlobSize {
		return "", fmt.Errorf("batch data exceeds max blob size: %d > %d", len(batchData), p.config.MaxBlobSize)
	}

	ctx, cancel := context.WithTimeout(ctx, p.config.SubmitTimeout)
	defer cancel()

	blob, err := blob.NewBlob(p.namespace, batchData, share.DefaultShareVersion)
	if err != nil {
		return "", fmt.Errorf("failed to create blob: %w", err)
	}

	height, err := p.client.Blob.Submit(ctx, []*blob.Blob{blob}, &blob.SubmitOptions{
		GasPrice: p.config.GasPrice,
	})
	if err != nil {
		return "", fmt.Errorf("failed to submit blob: %w", err)
	}

	commitment, err := blob.CreateCommitment(blob)
	if err != nil {
		return "", fmt.Errorf("failed to create commitment: %w", err)
	}

	return fmt.Sprintf("%d:%s", height, hex.EncodeToString(commitment)), nil
}

func (p *Publisher) RetrieveBatch(ctx context.Context, height uint64, commitment string) ([]byte, error) {
	ctx, cancel := context.WithTimeout(ctx, p.config.SubmitTimeout)
	defer cancel()

	commitmentBytes, err := hex.DecodeString(commitment)
	if err != nil {
		return nil, fmt.Errorf("invalid commitment: %w", err)
	}

	blob, err := p.client.Blob.Get(ctx, height, p.namespace, commitmentBytes)
	if err != nil {
		return nil, fmt.Errorf("failed to get blob: %w", err)
	}

	return blob.Data, nil
}

func (p *Publisher) Close() error {
	if p.client != nil {
		return p.client.Close()
	}
	return nil
}